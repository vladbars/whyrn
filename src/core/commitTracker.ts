import type { PropChange, RenderReason, StateChange } from '../types';
import { IS_DEV } from '../constants';
import { getConfig, shouldTrack, boundaryComponents, internalComponents, getForcedName } from '../utils';
import { diffProps, buildReasons, isAvoidable, isEquivalent } from './differ';
import { recordRender } from './tracker';
import { checkCritical } from './critical';
import { getSourceHint } from './source';
import type { SourceHint } from './source';
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
  /** withWhyRN component or report="all": always reported. */
  forced?: boolean;
  source?: SourceHint;
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

function finiteMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Self + subtree render time of this commit. Only recorded in profiling mode (dev with the DevTools hook). */
function getDuration(fiber: Fiber): number | undefined {
  return finiteMs((fiber as Fiber & { actualDuration?: number }).actualDuration);
}


function handleCommit(root: FiberRoot | undefined): void {
  const rootFiber = root?.current;
  if (!rootFiber) return;

  const config = getConfig();
  const watching = !!config?.enabled;

  const reports: PendingReport[] = [];

  // Avoidable renders of this commit, linked into chains: a component that
  // rendered avoidably because its owner did belongs to the owner's chain.
  interface Candidate {
    report: PendingReport;
    fiber: Fiber;
    root: Fiber;
  }
  const candidates: Candidate[] = [];
  const chainRoot = new Map<Fiber, Fiber>();
  // Tracked components that rendered for a legitimate reason. Their subtrees
  // are not the fault of an avoidable ancestor and are subtracted from its cost.
  const legit: Fiber[] = [];
  const report = config?.report ?? 'critical';

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
        const reportAll = forcedName !== undefined || report === 'all';
        const { name: owner, fiber: ownerFiber } = getOwner(fiber);
        const durationMs = getDuration(fiber);

        const entry: PendingReport = {
          name,
          reasons,
          avoidable,
          owner,
          memo: isMemoFiber(fiber),
          durationMs,
          instanceId: getInstanceId(fiber),
          count: 1,
          hostNodes: [],
        };

        if (avoidable) {
          const parentRoot = ownerFiber
            ? chainRoot.get(ownerFiber) ?? (ownerFiber.alternate ? chainRoot.get(ownerFiber.alternate) : undefined)
            : undefined;
          const rootOfChain = parentRoot ?? fiber;
          chainRoot.set(fiber, rootOfChain);
          candidates.push({ report: entry, fiber, root: rootOfChain });
        } else {
          legit.push(fiber);
        }

        if (!avoidable && reportAll) {
          entry.hostNodes = findHostFibers(fiber).map((host) => host.stateNode);
          reports.push(entry);
        }

        if (avoidable && reportAll) {
          // Forced components and report="all" never wait for the chain decision.
          const c = candidates[candidates.length - 1];
          c.report.forced = true;
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

  // Decide per chain. Its cost is the render time it caused: the root's whole
  // subtree time, minus subtrees that rendered for other reasons (legitimate
  // renders, other chains) - those are not this chain's fault.
  const chains = new Map<Fiber, Candidate[]>();
  const memberOf = new Map<Fiber, Candidate>();
  for (const c of candidates) {
    const list = chains.get(c.root);
    if (list) list.push(c);
    else chains.set(c.root, [c]);
    memberOf.set(c.fiber, c);
  }

  const lookup = <T,>(map: Map<Fiber, T>, f: Fiber): T | undefined =>
    map.get(f) ?? (f.alternate ? map.get(f.alternate) : undefined);
  const legitSet = new Set(legit);
  const isLegit = (f: Fiber) => legitSet.has(f) || (!!f.alternate && legitSet.has(f.alternate));

  const subtract = new Map<Fiber, number>();
  const foreign: Array<{ fiber: Fiber; chain?: Fiber }> = [
    ...legit.map((fiber) => ({ fiber })),
    ...[...chains.keys()].map((fiber) => ({ fiber, chain: fiber })),
  ];
  for (const { fiber, chain } of foreign) {
    const ms = getDuration(fiber);
    if (ms === undefined) continue;
    for (let node = fiber.return; node; node = node.return) {
      if (isLegit(node)) break; // inside a legitimate subtree that is already excluded
      const owner = lookup(memberOf, node);
      if (owner) {
        if (owner.root !== chain) subtract.set(owner.root, (subtract.get(owner.root) ?? 0) + ms);
        break;
      }
    }
  }

  const now = Date.now();
  for (const [rootOfChain, members] of chains) {
    const head = members[0];
    const total = getDuration(rootOfChain);
    const cost = total !== undefined ? Math.max(0, total - (subtract.get(rootOfChain) ?? 0)) : undefined;

    let include = report === 'avoidable' || report === 'all';
    let headCount = 1;
    let headMs = cost;

    if (!include && report === 'critical') {
      const result = checkCritical(
        `${head.report.name}\u0000${head.report.owner ?? ''}`,
        cost,
        config?.criticalMs ?? 16,
        now
      );
      include = result.critical;
      headCount = result.count;
      headMs = result.ms;
    }

    for (const m of members) {
      if (!include && !m.report.forced) continue;
      const isHead = m.fiber === rootOfChain;
      if (isHead) {
        m.report.count = include ? headCount : 1;
        m.report.wastedMs = headMs;
        m.report.hostNodes = findHostFibers(m.fiber).map((host) => host.stateNode);
        m.report.source = getSourceHint(m.fiber);
      } else {
        // Its time is already part of the chain's cost.
        m.report.follows = head.report.name;
        m.report.source = getSourceHint(m.fiber);
      }
      reports.push(m.report);
    }
  }

  if (reports.length === 0) return;

  const events = reports.map((report) => ({
    event: recordRender(report.name, report.reasons, {
      avoidable: report.avoidable,
      owner: report.owner,
      memo: report.memo,
      follows: report.follows,
      source: report.source,
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
      const name = nextDep.context?.displayName ?? 'Context (set its displayName to see which)';
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
