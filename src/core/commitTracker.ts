import type { PropChange, RenderReason, StateChange } from '../types';
import { IS_DEV } from '../constants';
import { getConfig, shouldTrack, boundaryComponents, internalComponents, getForcedName } from '../utils';
import { diffProps, buildReasons } from './differ';
import { recordRender } from './tracker';
import { overlayManager } from '../overlay/OverlayManager';
import {
  ClassComponent,
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
  hostNodes: unknown[];
}

function handleCommit(root: FiberRoot | undefined): void {
  const rootFiber = root?.current;
  if (!rootFiber) return;

  const config = getConfig();
  const watching = !!config?.enabled;

  const reports: PendingReport[] = [];
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
        reports.push({
          name,
          reasons: computeReasons(fiber, prev, config?.trackHooks ?? true),
          hostNodes: findHostFibers(fiber).map((host) => host.stateNode),
        });
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
    event: recordRender(report.name, report.reasons),
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

function computeReasons(fiber: Fiber, prev: Fiber, trackHooks: boolean): RenderReason[] {
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

  if (reasons.length === 1 && reasons[0].type === 'parent') {
    if (!propsChanged) {
      reasons[0].detail = 'Re-rendered with the same props and state';
    } else if (prevProps && prevProps.children !== nextProps.children) {
      reasons[0].detail = 'Parent re-rendered (new children)';
    }
  }

  return reasons;
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
        });
      }
      stateIndex++;
    } else if (isExternalStoreHook(nextHook)) {
      if (!Object.is(prevHook.memoizedState, nextHook.memoizedState)) {
        extra.push({ type: 'hooks', detail: 'External store changed (useSyncExternalStore)' });
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
      changes.push({ index: index, hookName: `state.${key}`, prev: prevState[key], next: nextState[key] });
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
      reasons.push({ type: 'context', detail: `${name} value changed` });
    }
    prevDep = prevDep.next;
    nextDep = nextDep.next;
  }

  return reasons;
}
