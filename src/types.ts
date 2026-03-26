import type { ReactNode } from 'react';

export type ChangeType = 'props' | 'state' | 'hooks' | 'context' | 'parent';

export interface PropChange {
  key: string;
  prev: unknown;
  next: unknown;
  referenceChanged: boolean;
  valueChanged: boolean;
}

export interface StateChange {
  index: number;
  hookName: string;
  prev: unknown;
  next: unknown;
}

export interface RenderReason {
  type: ChangeType;
  propChanges?: PropChange[];
  stateChanges?: StateChange[];
  detail?: string;
}

export interface RenderEvent {
  componentName: string;
  renderCount: number;
  timestamp: number;
  reasons: RenderReason[];
  layout?: ComponentLayout;
}

export interface ComponentLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayEntry {
  id: string;
  event: RenderEvent;
  opacity: import('react-native').Animated.Value;
}

export interface WhyRNConfig {
  enabled: boolean;
  trackHooks: boolean;
  logToConsole: boolean;
  heatmap: boolean;
  flashDuration: number;
  flashColor: string;
  heatmapColdColor: string;
  heatmapHotColor: string;
  maxOverlays: number;
  include: RegExp[];
  exclude: RegExp[];
}

export interface WhyRNProps extends Partial<WhyRNConfig> {
  children: ReactNode;
}
