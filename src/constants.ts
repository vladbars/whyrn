import type { WhyRNConfig } from './types';

declare const __DEV__: boolean;

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

export const DEFAULT_CONFIG: WhyRNConfig = {
  enabled: isDev,
  trackHooks: true,
  logToConsole: true,
  heatmap: false,
  flashDuration: 600,
  flashColor: '#FF6B6B',
  heatmapColdColor: '#3B82F6',
  heatmapHotColor: '#EF4444',
  maxOverlays: 50,
  include: [],
  exclude: [/^RN/, /^RCT/, /^__/],
};
