import type { ReactNode } from 'react';

export type EditorName = 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'webstorm' | 'idea' | 'none';
export type EditorOption =
  | EditorName
  | ((location: { file: string; lineNumber: number; column?: number }) => string);

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
  /** Rendered only because this (already reported) component did. */
  follows?: string;
  /** Where the component is rendered (dev only), resolved through Metro on demand. */
  source?: import('./core/source').SourceHint;
  /** Render time of this component and its subtree in this commit (dev builds), ms. */
  durationMs?: number;
  /** Stable id of the component instance, to tell instances apart. */
  instanceId?: number;
  /** Renders this event stands for (a critical burst reports its whole window). */
  count?: number;
  /** Render time spent on avoidable renders this event stands for, ms. */
  wastedMs?: number;
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
   * `critical` (default): avoidable re-renders that cost real time — at least
   * `criticalMs` of wasted render time per second for a component.
   * `avoidable`: every wasted re-render, however cheap. `all`: every re-render.
   */
  report: 'critical' | 'avoidable' | 'all';
  /** Wasted render time per second (ms) that makes a component critical. */
  criticalMs: number;
  /**
   * How source links in the console are written. Editor URL schemes open the
   * file straight from the React Native DevTools console (the browser asks
   * once to allow it). `'none'` prints a plain path.
   */
  editor: EditorOption;
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
