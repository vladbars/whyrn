import type { WhyRNConfig } from './types';
import { INTERNAL_EXCLUDE } from './constants';

let currentConfig: WhyRNConfig | null = null;

export function setConfig(config: WhyRNConfig | null): void {
  currentConfig = config;
}

export function getConfig(): WhyRNConfig | null {
  return currentConfig;
}

// Subtrees of these components are never inspected (WhyRN's own overlay).
// eslint-disable-next-line @typescript-eslint/ban-types
export const internalComponents = new WeakSet<object>();

// Re-renders are reported only below these components (the <WhyRN> root).
export const boundaryComponents = new WeakSet<object>();

// Components opted in with withWhyRN(), tracked even without <WhyRN>.
const forcedComponents = new WeakMap<object, string>();

export function registerForced(component: object, name: string): void {
  forcedComponents.set(component, name);
}

export function getForcedName(type: unknown): string | undefined {
  if ((typeof type !== 'object' && typeof type !== 'function') || type === null) return undefined;
  return forcedComponents.get(type);
}

export function getComponentName(component: React.ComponentType<unknown>): string {
  const c = component as { displayName?: string; name?: string; type?: { displayName?: string; name?: string }; render?: { displayName?: string; name?: string } };
  return (
    c.displayName ||
    c.name ||
    c.type?.displayName ||
    c.type?.name ||
    c.render?.displayName ||
    c.render?.name ||
    'Anonymous'
  );
}

export function shouldTrack(name: string, config: WhyRNConfig): boolean {
  if (!config.enabled) return false;

  for (const pattern of INTERNAL_EXCLUDE) {
    if (pattern.test(name)) return false;
  }

  for (const pattern of config.exclude) {
    if (pattern.test(name)) return false;
  }

  if (config.include.length > 0) {
    return config.include.some((pattern) => pattern.test(name));
  }

  return true;
}

let idCounter = 0;
export function uniqueId(): string {
  return `whyrn_${++idCounter}_${Date.now()}`;
}

export function truncate(value: unknown, maxLen = 40): string {
  let str: string | undefined;
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'function') {
    str = `ƒ ${value.name || 'anonymous'}()`;
  } else {
    try {
      str = JSON.stringify(value);
    } catch {
      str = Object.prototype.toString.call(value);
    }
  }
  if (str == null) return 'undefined';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
