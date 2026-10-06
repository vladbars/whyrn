import type { RenderEvent, PropChange, StateChange } from '../types';
import { getConfig, truncate } from '../utils';
import { formatLocation, resolveSource } from './source';
import type { SourceHint } from './source';

const FLUSH_MS = 1000;

function kindLabel(change: PropChange): string {
  switch (change.kind) {
    case 'function':
      return ' (new function reference)';
    case 'reference':
      return ' (new reference, same value)';
    default:
      return '';
  }
}

function formatPropChange(change: PropChange): string {
  return `  prop "${change.key}" changed${kindLabel(change)}: ${truncate(change.prev)} → ${truncate(change.next)}`;
}

function formatStateChange(change: StateChange): string {
  const same = change.equivalent ? ' (new reference, same value)' : '';
  return `  ${change.hookName} changed${same}: ${truncate(change.prev)} → ${truncate(change.next)}`;
}

/** One block per re-render - used with report="all". */
export function formatRenderEvent(event: RenderEvent): void {
  const tag = event.avoidable ? ' - avoidable' : '';
  const lines: string[] = [`🔁 ${event.componentName} re-rendered (#${event.renderCount})${tag}`];

  for (const reason of event.reasons) {
    switch (reason.type) {
      case 'props':
        if (reason.propChanges) lines.push(...reason.propChanges.map(formatPropChange));
        break;
      case 'state':
        if (reason.stateChanges) lines.push(...reason.stateChanges.map(formatStateChange));
        break;
      case 'parent':
        lines.push(`  ${reason.detail ?? 'Parent re-rendered'}`);
        break;
      case 'context':
        lines.push(`  ${reason.detail ?? 'Context value changed'}`);
        break;
      case 'hooks':
        lines.push(`  ${reason.detail ?? 'Hook dependency changed'}`);
        break;
    }
  }

  console.log(lines.join('\n'));
}

/* ── Summary of avoidable re-renders (report="avoidable") ───────────────── */

interface Summary {
  name: string;
  count: number;
  /** Wasted render time, when React recorded timings. */
  ms?: number;
  instances: Set<number>;
  owner?: string;
  memo: boolean;
  /** Only renders because a reported component did. Listed after the root causes. */
  follows?: string;
  source?: SourceHint;
  causes: Map<string, number>;
}

function formatMs(ms: number): string {
  return ms >= 10 ? `${Math.round(ms)} ms` : `${ms.toFixed(1)} ms`;
}

function describe(s: Summary): string {
  const parts = [`${s.name} ×${s.count}`];
  if (s.instances.size > 1) parts.push(`${s.instances.size} instances`);
  if (s.ms !== undefined) parts.push(`${formatMs(s.ms)} wasted`);
  if (s.owner) parts.push(`rendered by ${s.owner}`);
  return parts.join(' · ');
}

const pending = new Map<string, Summary>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function where(owner: string | undefined): string {
  return owner ? ` in ${owner}` : ' in the parent';
}

/** Turn a reason into a short, actionable line. Identical lines are counted. */
function causesOf(event: RenderEvent): string[] {
  if (event.follows) {
    return [`only because ${event.follows} re-rendered - fix ${event.follows} first`];
  }

  const causes: string[] = [];
  const functions: string[] = [];
  const objects: string[] = [];

  for (const reason of event.reasons) {
    switch (reason.type) {
      case 'props':
        for (const change of reason.propChanges ?? []) {
          if (change.kind === 'function') functions.push(change.key);
          else if (change.kind === 'reference') objects.push(change.key);
        }
        break;
      case 'state':
        for (const change of reason.stateChanges ?? []) {
          causes.push(`${change.hookName} set to an equal value - keep the previous object`);
        }
        break;
      case 'context':
        causes.push(`${reason.detail} - useMemo the Provider value`);
        break;
      case 'hooks':
        causes.push(`${reason.detail} - select primitives or use a shallow-equal selector`);
        break;
      case 'parent':
        break;
    }
  }

  const list = (keys: string[]) => keys.map((k) => `"${k}"`).join(', ');
  const propsOnly = event.reasons.every((r) => r.type === 'props' || r.type === 'parent');
  const memoHint = !propsOnly
    ? ''
    : event.memo
      ? ` (they defeat React.memo(${event.componentName}))`
      : `, then React.memo(${event.componentName})`;

  if (functions.length > 0) {
    causes.push(`${functions.length > 1 ? 'props' : 'prop'} ${list(functions)}: new function every render - useCallback${where(event.owner)}${memoHint}`);
  }
  if (objects.length > 0) {
    causes.push(`${objects.length > 1 ? 'props' : 'prop'} ${list(objects)}: new object with the same content - useMemo${where(event.owner)}${functions.length > 0 ? '' : memoHint}`);
  }
  if (propsOnly && functions.length === 0 && objects.length === 0) {
    causes.push(event.memo ? 'props are equal' : `props are equal - wrap ${event.componentName} in React.memo`);
  }

  return causes;
}

// Details are printed once per component + cause. Repeats are only counted
// and reported as one short line every QUIET_MS, so a busy screen can't flood Metro.
const QUIET_MS = 10000;
const seenCauses = new Set<string>();
// Repeats since the last reminder, per component + owner.
const quiet = new Map<string, Summary>();
let lastQuietLog = 0;

function flush(): void {
  flushTimer = null;
  if (pending.size === 0) return;

  const summaries = [...pending.values()].sort(
    (a, b) => Number(!!a.follows) - Number(!!b.follows) || (b.ms ?? 0) - (a.ms ?? 0) || b.count - a.count
  );
  pending.clear();

  const fresh: Summary[] = [];
  for (const s of summaries) {
    const id = `${s.name}\u0000${s.owner ?? ''}`;
    const unseen = [...s.causes.keys()].filter((cause) => !seenCauses.has(`${id}\u0000${cause}`));
    if (unseen.length > 0) {
      unseen.forEach((cause) => seenCauses.add(`${id}\u0000${cause}`));
      fresh.push(s);
    } else {
      const q = quiet.get(id);
      if (q) {
        q.count += s.count;
        if (s.ms !== undefined) q.ms = (q.ms ?? 0) + s.ms;
        s.instances.forEach((i) => q.instances.add(i));
      } else {
        quiet.set(id, { ...s, instances: new Set(s.instances), causes: new Map() });
      }
    }
  }

  if (fresh.length > 0) {
    // Resolve where each problem is rendered (Metro symbolication), then print
    // the block once. "at file:line:col" is clickable in VS Code / iTerm.
    Promise.all(fresh.map((s) => resolveSource(s.source))).then(
      (locations) => {
        const total = fresh.reduce((sum, s) => sum + s.count, 0);
        const lines = [`⚠️ WhyRN: ${total} avoidable re-render${total === 1 ? '' : 's'}`];

        fresh.forEach((s, i) => {
          lines.push(`  ${describe(s)}`);
          const location = locations[i];
          if (location) lines.push(`    at ${formatLocation(location, getConfig()?.editor)}`);
          for (const [cause, n] of s.causes) {
            lines.push(`    ${n > 1 ? `${n}× ` : ''}${cause}`);
          }
        });

        console.log(lines.join('\n'));
      }
    );
  }

  const now = Date.now();
  if (quiet.size > 0 && now - lastQuietLog >= QUIET_MS) {
    // A reminder that still links to the code: the detailed block may be far up.
    const top = [...quiet.values()].sort(
      (a, b) => Number(!!a.follows) - Number(!!b.follows) || (b.ms ?? 0) - (a.ms ?? 0) || b.count - a.count
    );
    quiet.clear();
    lastQuietLog = now;

    const shown = top.slice(0, 6);
    Promise.all(shown.map((s) => resolveSource(s.source))).then(
      (locations) => {
        const lines = ['⚠️ WhyRN: still avoidable (same causes as above)'];
        shown.forEach((s, i) => {
          lines.push(`  ${describe(s)}`);
          const location = locations[i];
          if (location) lines.push(`    at ${formatLocation(location, getConfig()?.editor)}`);
          if (s.follows) lines.push(`    only because ${s.follows} re-rendered`);
        });
        if (top.length > shown.length) lines.push(`  … +${top.length - shown.length} more`);
        console.log(lines.join('\n'));
      }
    );
  }
}

export function queueAvoidable(event: RenderEvent): void {
  const key = `${event.componentName}\u0000${event.owner ?? ''}`;
  let summary = pending.get(key);
  if (!summary) {
    summary = {
      name: event.componentName,
      count: 0,
      instances: new Set(),
      owner: event.owner,
      memo: !!event.memo,
      follows: event.follows,
      source: event.source,
      causes: new Map(),
    };
    pending.set(key, summary);
  }

  const n = event.count ?? 1;
  summary.count += n;
  if (event.wastedMs !== undefined) summary.ms = (summary.ms ?? 0) + event.wastedMs;
  if (event.instanceId !== undefined) summary.instances.add(event.instanceId);
  for (const cause of causesOf(event)) {
    summary.causes.set(cause, (summary.causes.get(cause) ?? 0) + n);
  }

  if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_MS);
}
