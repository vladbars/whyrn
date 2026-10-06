import type { RenderEvent, PropChange, StateChange } from '../types';
import { truncate } from '../utils';

function formatPropChange(change: PropChange): string {
  const refLabel = typeof change.prev === 'function' && typeof change.next === 'function'
    ? ' (new function reference)'
    : change.referenceChanged && !change.valueChanged
      ? ' (new reference, same value)'
      : '';
  return `  prop "${change.key}" changed${refLabel}: ${truncate(change.prev)} → ${truncate(change.next)}`;
}

function formatStateChange(change: StateChange): string {
  return `  ${change.hookName} changed: ${truncate(change.prev)} → ${truncate(change.next)}`;
}

export function formatRenderEvent(event: RenderEvent): void {
  const header = `🔁 ${event.componentName} re-rendered (#${event.renderCount})`;
  const lines: string[] = [header];

  for (const reason of event.reasons) {
    switch (reason.type) {
      case 'props':
        if (reason.propChanges) {
          lines.push(...reason.propChanges.map(formatPropChange));
        }
        break;
      case 'state':
        if (reason.stateChanges) {
          lines.push(...reason.stateChanges.map(formatStateChange));
        }
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
