import type { PropChange, RenderReason, StateChange } from '../types';
import { IS_DEV } from '../constants';
import { getConfig, shouldTrack, boundaryComponents, internalComponents, getForcedName } from '../utils';
import { diffProps, buildReasons, isAvoidable, isEquivalent } from './differ';
import { recordRender } from './tracker';
import { checkCritical } from './critical';
import { overlayManager } from '../overlay/OverlayManager';
import {
  ClassComponent,
  MemoComponent,
  SimpleMemoComponent,
  didFiberRender,
  findHostFibers,
  getFiberName,
  isCompositeFiber,
  measureHostInstances,
} from './fiber';
import type { Fiber, FiberRoot, HookState } from './fiber';

// React renderers report every commit to this global hook (it is what React
// DevTools uses). Listening here lets us observe re-renders without replacing
// component types, patching hooks or wrapping components in extra views.
const HOOK_KEY = '__REACT_DEVTOOLS_GLOBAL_HOOK__';
const WRAPPED = Symbol.for('whyrn.onCommitFiberRoot');

interface DevToolsHook {
  onCommitFiberRoot?: (...args: unknown[]) => void;
  [key: string]: unknown;
}

function createStubHook(): DevToolsHook {
  let nextId = 0;
  const renderers = new Map<number, unknown>();
  return {
    renderers,
    supportsFiber: true,
    inject(renderer: unknown) {
      const id = ++nextId;
      renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
}

let warnedError = false;

export function installCommitTracker(): void {
  if (!IS_DEV) return;

  const g = globalThis as Record<string, unknown>;
  let hook = g[HOOK_KEY] as DevToolsHook | undefined;
  if (!hook) {
    // Must exist before the renderer initializes; RN dev bundles always provide one.
    hook = createStubHook();
    g[HOOK_KEY] = hook;
  }

  const current = hook.onCommitFiberRoot as (((...args: unknown[]) => void) & { [WRAPPED]?: true }) | undefined;
  if (current?.[WRAPPED]) return;

  const wrapped = function (this: unknown, ...args: unknown[]) {
    const result = current?.apply(this, args);
    try {
      handleCommit(args[1] as FiberRoot);
    } catch (error) {
      if (!warnedError) {
        warnedError = true;
        console.warn('[WhyRN] failed to inspect commit:', error);
      }
    }
    return result;
  } as ((...args: unknown[]) => void) & { [WRAPPED]?: true };
  wrapped[WRAPPED] = true;

  hook.onCommitFiberRoot = wrapped;
}

interface PendingReport {
  name: string;
  reasons: RenderReason[];
  avoidable: boolean;
  owner?: string;
  memo: boolean;
  /** Set when the owner was reported in the same commit: this render is a consequence. */
  follows?: string;
  durationMs?: number;
  instanceId: number;
  /** Renders / wasted ms this report stands for (a critical burst carries its window). */
  count: number;
  wastedMs?: number;
  hostNodes: unknown[];
}

// React keeps two fibers per component instance (current and alternate).
const instanceIds = new WeakMap<Fiber, number>();
let nextInstanceId = 1;

function getInstanceId(fiber: Fiber): number {
  let id = instanceIds.get(fiber) ?? (fiber.alternate ? instanceIds.get(fiber.alternate) : undefined);
  if (id === undefined) id = nextInstanceId++;
  instanceIds.set(fiber, id);
  if (fiber.alternate) instanceIds.set(fiber.alternate, id);
  return id;
}

/** Self + subtree render time of this commit. Only recorded in profiling mode (dev with the DevTools hook). */
function getDuration(fiber: Fiber): number | undefined {
  const d = (fiber as Fiber & { actualDuration?: number }).actualDuration;
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : undefined;
}

function handleCommit(root: FiberRoot | undefined): void {
  const rootFiber = root?.current;
  if (!rootFiber) return;

  const config = getConfig();
  const watching = !!config?.enabled;

  const reports: PendingReport[] = [];
  // Reported fiber → the root of its chain, so children of a flagged component
  // are shown as consequences instead of separate problems.
  const reportedRoots = new Map<Fiber, string>();
  const stack: Array<[Fiber, boolean]> = [[rootFiber, false]];

  while (stack.length > 0) {
    const [fiber, parentInside] = stack.pop()!;
    const prev = fiber.alternate;

    // Freshly mounted subtree: nothing in it can be a re-render.
    if (!prev) continue;
    if (fiber.type && internalComponents.has(fiber.type)) continue;

    const isBoundary = !!fiber.type && boundaryComponents.has(fiber.type);
    const inside = parentInside || isBoundary;

    if (!isBoundary && isCompositeFiber(fiber) && didFiberRender(fiber)) {
      const forcedName = getForcedName(fiber.elementType) ?? getForcedName(fiber.type);
      const name = forcedName ?? getFiberName(fiber);

      if (forcedName !== undefined || (watching && inside && shouldTrack(name, config!))) {
        const { reasons, avoidable } = computeReasons(fiber, prev, config?.trackHooks ?? true);
        const reportAll = forcedName !== undefined || config?.report === 'all';
        const ownerInfo = getOwner(fiber);
        const owner = ownerInfo.name;
        const ownerFiber = ownerInfo.fiber;
        const follows = ownerFiber
          ? reportedRoots.get(ownerFiber) ?? (ownerFiber.alternate ? reportedRoots.get(ownerFiber.alternate) : undefined)
          : undefined;
        const durationMs = getDuration(fiber);
        let count = 1;
        let wastedMs = avoidable ? durationMs : undefined;
        let include = reportAll || (avoidable && config?.report === 'avoidable');

        if (!include && avoidable && (config?.report ?? 'critical') === 'critical') {
          const result = checkCritical(
            `${name}\u0000${owner ?? ''}`,
            durationMs,
            config?.criticalMs ?? 16,
            Date.now()
          );
          include = result.critical;
          count = result.count;
          wastedMs = result.ms;
        }

        if (include) {
          reports.push({
            name,
            reasons,
            avoidable,
            owner,
            memo: isMemoFiber(fiber),
            follows,
            durationMs,
            instanceId: getInstanceId(fiber),
            count,
            wastedMs,
            hostNodes: follows ? [] : findHostFibers(fiber).map((host) => host.stateNode),
          });
          reportedRoots.set(fiber, follows ?? name);
        }
      }
    }

    // Children are only re-created when something below did work this commit.
    if (fiber.child !== prev.child) {
      for (let child = fiber.child; child; child = child.sibling) {
        stack.push([child, inside]);
      }
    }
  }

  if (reports.length === 0) return;

  const events = reports.map((report) => ({
    event: recordRender(report.name, report.reasons, {
      avoidable: report.avoidable,
      owner: report.owner,
      memo: report.memo,
      follows: report.follows,
      durationMs: report.durationMs,
      instanceId: report.instanceId,
      count: report.count,
      wastedMs: report.wastedMs,
    }),
    hostNodes: report.hostNodes,
  }));

  if (!watching) return;

  // Measure after the native side has applied this commit's layout.
  requestAnimationFrame(() => {
    for (const { event, hostNodes } of events) {
      measureHostInstances(hostNodes, (layout) => {
        if (layout) overlayManager.emit({ ...event, layout });
      });
    }
  });
}

function isMemoFiber(fiber: Fiber): boolean {
  return fiber.tag === SimpleMemoComponent || fiber.return?.tag === MemoComponent;
}

/** The component that rendered this one, i.e. where its props were created. */
function getOwner(fiber: Fiber): { name?: string; fiber?: Fiber } {
  const owner = (fiber as Fiber & { _debugOwner?: Fiber | { name?: string } | null })._debugOwner;
  if (owner && typeof (owner as Fiber).tag === 'number' && (owner as Fiber).type) {
    return { name: getFiberName(owner as Fiber), fiber: owner as Fiber };
  }

  for (let node = fiber.return; node; node = node.return) {
    if (isCompositeFiber(node) && !internalComponents.has(node.type) && !boundaryComponents.has(node.type)) {
      return { name: getFiberName(node), fiber: node };
    }
  }

  if (owner && typeof (owner as { name?: string }).name === 'string') {
    return { name: (owner as { name: string }).name };
  }
  return {};
}

function computeReasons(
  fiber: Fiber,
  prev: Fiber,
  trackHooks: boolean
): { reasons: RenderReason[]; avoidable: boolean } {
  const prevProps = prev.memoizedProps;
  const nextProps = fiber.memoizedProps ?? {};
  const propsChanged = prevProps !== nextProps;
  const propChanges: PropChange[] = propsChanged ? diffProps(prevProps, nextProps) : [];

  const stateChanges: StateChange[] = [];
  const extra: RenderReason[] = [];

  if (trackHooks) {
    if (fiber.tag === ClassComponent) {
      stateChanges.push(...diffClassState(prev.memoizedState, fiber.memoizedState));
    } else {
      diffHooks(prev.memoizedState, fiber.memoizedState, stateChanges, extra);
    }
    extra.push(...diffContexts(prev, fiber));
  }

  const reasons = buildReasons(propChanges, stateChanges, extra);

  if (reasons.length === 1 && reasons[0].type === 'parent' && !propsChanged) {
    // Same props object and no change we can see (e.g. useTransition, use()).
    // Not something we can call wasted.
    reasons[0].detail = 'Re-rendered with the same props and state';
    return { reasons, avoidable: false };
  }

  return { reasons, avoidable: isAvoidable(reasons) };
}

function isStateHook(hook: HookState): boolean {
  return !!hook.queue && 'lastRenderedReducer' in hook.queue;
}

function isExternalStoreHook(hook: HookState): boolean {
  return !!hook.queue && 'getSnapshot' in hook.queue;
}

function diffHooks(
  prevHook: HookState | null,
  nextHook: HookState | null,
  stateChanges: StateChange[],
  extra: RenderReason[]
): void {
  let stateIndex = 0;

  while (prevHook && nextHook) {
    if (isStateHook(nextHook)) {
      if (!Object.is(prevHook.memoizedState, nextHook.memoizedState)) {
        stateChanges.push({
          index: stateIndex,
          hookName: `state[${stateIndex}]`,
          prev: prevHook.memoizedState,
          next: nextHook.memoizedState,
          equivalent: isEquivalent(prevHook.memoizedState, nextHook.memoizedState),
        });
      }
      stateIndex++;
    } else if (isExternalStoreHook(nextHook)) {
      if (!Object.is(prevHook.memoizedState, nextHook.memoizedState)) {
        const same = isEquivalent(prevHook.memoizedState, nextHook.memoizedState);
        extra.push({
          type: 'hooks',
          equivalent: same,
          detail: same
            ? 'Store selector returned a new object with the same content'
            : 'External store changed (useSyncExternalStore)',
        });
      }
    }

    prevHook = prevHook.next;
    nextHook = nextHook.next;
  }
}

function diffClassState(prev: unknown, next: unknown): StateChange[] {
  if (Object.is(prev, next) || typeof prev !== 'object' || typeof next !== 'object' || !prev || !next) {
    return [];
  }

  const changes: StateChange[] = [];
  const prevState = prev as Record<string, unknown>;
  const nextState = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(prevState), ...Object.keys(nextState)]);
  let index = 0;

  for (const key of keys) {
    if (!Object.is(prevState[key], nextState[key])) {
      changes.push({
        index,
        hookName: `state.${key}`,
        prev: prevState[key],
        next: nextState[key],
        equivalent: isEquivalent(prevState[key], nextState[key]),
      });
    }
    index++;
  }

  return changes;
}

function diffContexts(prev: Fiber, next: Fiber): RenderReason[] {
  const reasons: RenderReason[] = [];
  let prevDep = prev.dependencies?.firstContext ?? null;
  let nextDep = next.dependencies?.firstContext ?? null;

  while (prevDep && nextDep) {
    if (!Object.is(prevDep.memoizedValue, nextDep.memoizedValue)) {
      const name = nextDep.context?.displayName ?? 'Context';
      const same = isEquivalent(prevDep.memoizedValue, nextDep.memoizedValue);
      reasons.push({
        type: 'context',
        equivalent: same,
        detail: same ? `${name} got a new value with the same content` : `${name} value changed`,
      });
    }
    prevDep = prevDep.next;
    nextDep = nextDep.next;
  }

  return reasons;
}
