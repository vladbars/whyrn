import type { RenderEvent, RenderReason, ComponentLayout } from '../types';
import { overlayManager } from '../overlay/OverlayManager';
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

export function trackRender(
  componentName: string,
  reasons: RenderReason[],
  layout?: ComponentLayout
): void {
  const config = getConfig();
  if (!config?.enabled) return;

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
    layout,
  };

  if (config.logToConsole) {
    formatRenderEvent(event);
  }

  overlayManager.emit(event);
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
