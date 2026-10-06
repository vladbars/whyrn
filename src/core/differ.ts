import type { PropChange, RenderReason, StateChange } from '../types';

function isShallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);

  if (keysA.length !== keysB.length) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  for (const key of keysA) {
    if (!Object.is(objA[key], objB[key])) return false;
  }

  return true;
}

export function diffProps(
  prevProps: Record<string, unknown> | null,
  nextProps: Record<string, unknown>
): PropChange[] {
  if (prevProps === null) return [];

  const changes: PropChange[] = [];
  const allKeys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)]);

  for (const key of allKeys) {
    if (key === 'children') continue;

    const prev = prevProps[key];
    const next = nextProps[key];

    if (!Object.is(prev, next)) {
      changes.push({
        key,
        prev,
        next,
        referenceChanged: prev !== next,
        valueChanged: !isShallowEqual(prev, next),
      });
    }
  }

  return changes;
}

export function diffState(
  prevStates: unknown[],
  nextStates: unknown[]
): StateChange[] {
  const changes: StateChange[] = [];
  const len = Math.max(prevStates.length, nextStates.length);

  for (let i = 0; i < len; i++) {
    const prev = prevStates[i];
    const next = nextStates[i];

    if (!Object.is(prev, next)) {
      changes.push({
        index: i,
        hookName: `state[${i}]`,
        prev,
        next,
      });
    }
  }

  return changes;
}

export function buildReasons(
  propChanges: PropChange[],
  stateChanges: StateChange[],
  extra: RenderReason[] = []
): RenderReason[] {
  const reasons: RenderReason[] = [];

  if (propChanges.length > 0) {
    reasons.push({ type: 'props', propChanges });
  }

  if (stateChanges.length > 0) {
    reasons.push({ type: 'state', stateChanges });
  }

  reasons.push(...extra);

  if (reasons.length === 0) {
    reasons.push({ type: 'parent', detail: 'Parent re-rendered' });
  }

  return reasons;
}
