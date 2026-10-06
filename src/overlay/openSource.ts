import type { RenderEvent } from '../types';
import { openInEditor, resolveSource } from '../core/source';

/** Tap on a badge: open the JSX that rendered this component in the editor. */
export function openEventSource(event: RenderEvent): void {
  resolveSource(event.source).then((location) => {
    if (location) openInEditor(location);
  });
}
