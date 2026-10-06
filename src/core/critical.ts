// Decides which avoidable re-renders are worth interrupting the developer for.
// A component (name + owner) is critical once its wasted render time in the
// last second reaches the threshold - a cheap icon rendering once never gets
// there, a heavy subtree or a component re-rendering on every animation frame
// does. Without timing data (no profiling) each render counts as a tenth of the
// threshold, i.e. ~10 avoidable renders per second.

const WINDOW_MS = 1000;

interface Sample {
  t: number;
  ms: number;
}

const samples = new Map<string, Sample[]>();
const hotUntil = new Map<string, number>();

export interface CriticalResult {
  critical: boolean;
  /** Renders and wasted ms to report now (the whole window when it just turned critical). */
  count: number;
  ms: number;
}

export function checkCritical(
  key: string,
  durationMs: number | undefined,
  thresholdMs: number,
  now: number
): CriticalResult {
  const ms = durationMs !== undefined ? durationMs : thresholdMs / 10;

  const list = (samples.get(key) ?? []).filter((s) => now - s.t < WINDOW_MS);
  list.push({ t: now, ms });
  samples.set(key, list);

  if ((hotUntil.get(key) ?? 0) > now) {
    hotUntil.set(key, now + WINDOW_MS);
    return { critical: true, count: 1, ms };
  }

  const total = list.reduce((sum, s) => sum + s.ms, 0);
  if (total >= thresholdMs) {
    hotUntil.set(key, now + WINDOW_MS);
    samples.set(key, []);
    return { critical: true, count: list.length, ms: total };
  }

  return { critical: false, count: 0, ms: 0 };
}

export function resetCritical(): void {
  samples.clear();
  hotUntil.clear();
}
