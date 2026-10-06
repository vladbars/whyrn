import type { ReactNode } from 'react';

export type ChangeType = 'props' | 'state' | 'hooks' | 'context' | 'parent';

/**
 * - `value`: the prop really changed.
 * - `reference`: a new object/array/element with the same content.
 * - `function`: a new function instance (inline callback).
 * The last two are avoidable with useMemo / useCallback.
 */
export type PropChangeKind = 'value' | 'reference' | 'function';

export interface PropChange {
  key: string;
  prev: unknown;
  next: unknown;
  kind: PropChangeKind;
  referenceChanged: boolean;
  valueChanged: boolean;
}

export interface StateChange {
  index: number;
  hookName: string;
  prev: unknown;
  next: unknown;
  /** New reference with the same content — the update could have been skipped. */
  equivalent?: boolean;
}

export interface RenderReason {
  type: ChangeType;
  propChanges?: PropChange[];
  stateChanges?: StateChange[];
  detail?: string;
  /** Context/store reason whose new value has the same content as the old one. */
  equivalent?: boolean;
}

export interface RenderEvent {
  componentName: string;
  renderCount: number;
  timestamp: number;
  reasons: RenderReason[];
  /** Nothing this component depends on really changed — the render was wasted. */
  avoidable: boolean;
  /** Component that rendered this one (where unstable props come from). */
  owner?: string;
  /** Wrapped in React.memo. */
  memo?: boolean;
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
  /**
   * `avoidable` (default): only wasted re-renders — nothing the component
   * depends on really changed. `all`: every re-render.
   */
  report: 'avoidable' | 'all';
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
