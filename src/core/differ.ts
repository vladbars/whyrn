import type { PropChange, PropChangeKind, RenderReason, StateChange } from '../types';

const REACT_ELEMENT_TYPES = new Set([Symbol.for('react.element'), Symbol.for('react.transitional.element')]);
const MAX_DEPTH = 6;
const MAX_NODES = 2000;

interface Budget {
  nodes: number;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Structural equality used to tell "new reference, same content" apart from a
 * real change. Functions count as equivalent (a new closure is the classic
 * avoidable prop). Class instances (Animated values, Dates, Maps…) only match by
 * reference. Large or deep values give up and report "not equivalent", so a
 * render is never wrongly labelled as avoidable.
 */
function equivalent(a: unknown, b: unknown, depth: number, budget: Budget): boolean {
  if (Object.is(a, b)) return true;
  if (++budget.nodes > MAX_NODES || depth > MAX_DEPTH) return false;

  if (typeof a === 'function' && typeof b === 'function') return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!equivalent(a[i], b[i], depth + 1, budget)) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  if (REACT_ELEMENT_TYPES.has(objA.$$typeof as symbol)) {
    return (
      objA.$$typeof === objB.$$typeof &&
      objA.type === objB.type &&
      objA.key === objB.key &&
      equivalent(objA.props, objB.props, depth + 1, budget)
    );
  }

  if (!isPlainObject(objA) || !isPlainObject(objB)) return false;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!equivalent(objA[key], objB[key], depth + 1, budget)) return false;
  }

  return true;
}

export function isEquivalent(a: unknown, b: unknown): boolean {
  return equivalent(a, b, 0, { nodes: 0 });
}

function changeKind(prev: unknown, next: unknown): PropChangeKind {
  if (typeof prev === 'function' && typeof next === 'function') return 'function';
  return isEquivalent(prev, next) ? 'reference' : 'value';
}

export function diffProps(
  prevProps: Record<string, unknown> | null,
  nextProps: Record<string, unknown>
): PropChange[] {
  if (prevProps === null) return [];

  const changes: PropChange[] = [];
  const allKeys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)]);

  for (const key of allKeys) {
    const prev = prevProps[key];
    const next = nextProps[key];

    if (!Object.is(prev, next)) {
      const kind = changeKind(prev, next);
      changes.push({
        key,
        prev,
        next,
        kind,
        referenceChanged: true,
        valueChanged: kind === 'value',
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
        equivalent: isEquivalent(prev, next),
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

/**
 * A render is avoidable when nothing the component depends on really changed:
 * props only changed by reference, state was set to an equal value, context and
 * stores pushed equal content — or the parent rendered with equal props.
 */
export function isAvoidable(reasons: RenderReason[]): boolean {
  for (const reason of reasons) {
    switch (reason.type) {
      case 'props':
        if (reason.propChanges?.some((c) => c.kind === 'value')) return false;
        break;
      case 'state':
        if (reason.stateChanges?.some((c) => !c.equivalent)) return false;
        break;
      case 'context':
      case 'hooks':
        if (!reason.equivalent) return false;
        break;
      case 'parent':
        break;
    }
  }
  return true;
}
