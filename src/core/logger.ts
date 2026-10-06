import type { RenderEvent, PropChange, StateChange } from '../types';
import { truncate } from '../utils';

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

/** One block per re-render — used with report="all". */
export function formatRenderEvent(event: RenderEvent): void {
  const tag = event.avoidable ? ' — avoidable' : '';
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
  owner?: string;
  memo: boolean;
  causes: Map<string, number>;
}

const pending = new Map<string, Summary>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function where(owner: string | undefined): string {
  return owner ? ` in ${owner}` : ' in the parent';
}

/** Turn a reason into a short, actionable line. Identical lines are counted. */
function causesOf(event: RenderEvent): string[] {
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
          causes.push(`${change.hookName} set to an equal value — keep the previous object`);
        }
        break;
      case 'context':
        causes.push(`${reason.detail} — useMemo the Provider value`);
        break;
      case 'hooks':
        causes.push(`${reason.detail} — select primitives or use a shallow-equal selector`);
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
    causes.push(`${functions.length > 1 ? 'props' : 'prop'} ${list(functions)}: new function every render — useCallback${where(event.owner)}${memoHint}`);
  }
  if (objects.length > 0) {
    causes.push(`${objects.length > 1 ? 'props' : 'prop'} ${list(objects)}: new object with the same content — useMemo${where(event.owner)}${functions.length > 0 ? '' : memoHint}`);
  }
  if (propsOnly && functions.length === 0 && objects.length === 0) {
    causes.push(event.memo ? 'props are equal' : `props are equal — wrap ${event.componentName} in React.memo`);
  }

  return causes;
}

// Details are printed once per component + cause. Repeats are only counted
// and reported as one short line every QUIET_MS, so a busy screen can't flood Metro.
const QUIET_MS = 10000;
const seenCauses = new Set<string>();
const quiet = new Map<string, number>();
let lastQuietLog = 0;

function flush(): void {
  flushTimer = null;
  if (pending.size === 0) return;

  const summaries = [...pending.values()].sort((a, b) => b.count - a.count);
  pending.clear();

  const fresh: Summary[] = [];
  for (const s of summaries) {
    const id = `${s.name}\u0000${s.owner ?? ''}`;
    const unseen = [...s.causes.keys()].filter((cause) => !seenCauses.has(`${id}\u0000${cause}`));
    if (unseen.length > 0) {
      unseen.forEach((cause) => seenCauses.add(`${id}\u0000${cause}`));
      fresh.push(s);
    } else {
      quiet.set(s.name, (quiet.get(s.name) ?? 0) + s.count);
    }
  }

  if (fresh.length > 0) {
    const total = fresh.reduce((sum, s) => sum + s.count, 0);
    const lines = [`⚠️ WhyRN: ${total} avoidable re-render${total === 1 ? '' : 's'}`];

    for (const s of fresh) {
      const by = s.owner ? ` · rendered by ${s.owner}` : '';
      lines.push(`  ${s.name} ×${s.count}${by}`);
      for (const [cause, n] of s.causes) {
        lines.push(`    ${n > 1 ? `${n}× ` : ''}${cause}`);
      }
    }

    console.log(lines.join('\n'));
  }

  const now = Date.now();
  if (quiet.size > 0 && now - lastQuietLog >= QUIET_MS) {
    const top = [...quiet.entries()].sort((a, b) => b[1] - a[1]);
    const list = top.slice(0, 6).map(([name, n]) => `${name} ×${n}`).join(', ');
    const more = top.length > 6 ? `, +${top.length - 6} more` : '';
    console.log(`⚠️ WhyRN: still avoidable — ${list}${more} (same causes as above)`);
    quiet.clear();
    lastQuietLog = now;
  }
}

export function queueAvoidable(event: RenderEvent): void {
  const key = `${event.componentName}\u0000${event.owner ?? ''}`;
  let summary = pending.get(key);
  if (!summary) {
    summary = { name: event.componentName, count: 0, owner: event.owner, memo: !!event.memo, causes: new Map() };
    pending.set(key, summary);
  }

  summary.count++;
  for (const cause of causesOf(event)) {
    summary.causes.set(cause, (summary.causes.get(cause) ?? 0) + 1);
  }

  if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_MS);
}
