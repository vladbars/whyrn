import type { WhyRNConfig } from './types';

let currentConfig: WhyRNConfig | null = null;

export function setConfig(config: WhyRNConfig): void {
  currentConfig = config;
}

export function getConfig(): WhyRNConfig | null {
  return currentConfig;
}

export function getComponentName(component: React.ComponentType<unknown>): string {
  return component.displayName || component.name || 'Anonymous';
}

export function shouldTrack(name: string, config: WhyRNConfig): boolean {
  if (!config.enabled) return false;

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
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str == null) return 'undefined';
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
