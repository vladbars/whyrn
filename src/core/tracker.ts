import type { RenderEvent, RenderReason } from '../types';
import { getConfig } from '../utils';
import { formatRenderEvent } from './logger';

interface ComponentRecord {
  renderCount: number;
  timestamps: number[];
}

const records = new Map<string, ComponentRecord>();

const WINDOW_MS = 5000;

function getRecord(componentName: string): ComponentRecord {
  let record = records.get(componentName);
  if (!record) {
    record = { renderCount: 0, timestamps: [] };
    records.set(componentName, record);
  }
  return record;
}

function pruneTimestamps(record: ComponentRecord, now: number): void {
  const cutoff = now - WINDOW_MS;
  record.timestamps = record.timestamps.filter((t) => t > cutoff);
}

/** Count a re-render and log it. Without <WhyRN> mounted it still logs to the console. */
export function recordRender(componentName: string, reasons: RenderReason[]): RenderEvent {
  const config = getConfig();

  const now = Date.now();
  const record = getRecord(componentName);
  record.renderCount++;
  record.timestamps.push(now);
  pruneTimestamps(record, now);

  const event: RenderEvent = {
    componentName,
    renderCount: record.renderCount,
    timestamp: now,
    reasons,
  };

  if (config ? config.enabled && config.logToConsole : true) {
    formatRenderEvent(event);
  }

  return event;
}

export function getRenderCount(componentName: string): number {
  return getRecord(componentName).renderCount;
}

export function getRecentRenderRate(componentName: string): number {
  const record = records.get(componentName);
  if (!record) return 0;
  pruneTimestamps(record, Date.now());
  return record.timestamps.length;
}

export function resetTracking(): void {
  records.clear();
}
