import React from 'react';
import type { WhyRNConfig } from '../types';
import { getComponentName, shouldTrack } from '../utils';
import { createTrackedComponent } from './wrapComponent';

let patched = false;
let originalCreateElement: typeof React.createElement | null = null;

export function patchReact(config: WhyRNConfig): void {
  if (patched || !config.enabled) return;
  patched = true;

  originalCreateElement = React.createElement;

  const trackedTypes = new WeakMap<React.ComponentType<unknown>, React.ComponentType<unknown>>();

  (React as Record<string, unknown>).createElement = function patchedCreateElement(
    type: unknown,
    ...args: unknown[]
  ) {
    if (typeof type === 'function') {
      const comp = type as React.ComponentType<unknown>;
      const name = getComponentName(comp);

      if (shouldTrack(name, config)) {
        let tracked = trackedTypes.get(comp);
        if (!tracked) {
          tracked = createTrackedComponent(comp, name);
          trackedTypes.set(comp, tracked);
        }
        return originalCreateElement!.apply(
          React,
          [tracked, ...args] as Parameters<typeof React.createElement>
        );
      }
    }

    return originalCreateElement!.apply(
      React,
      [type, ...args] as Parameters<typeof React.createElement>
    );
  };
}

export function unpatchReact(): void {
  if (!patched || !originalCreateElement) return;
  (React as Record<string, unknown>).createElement = originalCreateElement;
  originalCreateElement = null;
  patched = false;
}

export function isPatched(): boolean {
  return patched;
}
