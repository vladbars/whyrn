import React, { useLayoutEffect, useMemo } from 'react';
import type { WhyRNProps, WhyRNConfig } from '../types';
import { DEFAULT_CONFIG, IS_DEV } from '../constants';
import { setConfig, boundaryComponents } from '../utils';
import { installCommitTracker } from '../core/commitTracker';
import { OverlayContainer } from '../overlay/OverlayContainer';
import { resetTracking } from '../core/tracker';

export const WhyRNContext = React.createContext<WhyRNConfig>(DEFAULT_CONFIG);

boundaryComponents.add(WhyRN);

export function WhyRN({
  children,
  enabled = DEFAULT_CONFIG.enabled,
  report = DEFAULT_CONFIG.report,
  criticalMs = DEFAULT_CONFIG.criticalMs,
  editor = DEFAULT_CONFIG.editor,
  trackHooks = DEFAULT_CONFIG.trackHooks,
  logToConsole = DEFAULT_CONFIG.logToConsole,
  heatmap = DEFAULT_CONFIG.heatmap,
  flashDuration = DEFAULT_CONFIG.flashDuration,
  flashColor = DEFAULT_CONFIG.flashColor,
  heatmapColdColor = DEFAULT_CONFIG.heatmapColdColor,
  heatmapHotColor = DEFAULT_CONFIG.heatmapHotColor,
  maxOverlays = DEFAULT_CONFIG.maxOverlays,
  include = DEFAULT_CONFIG.include,
  exclude = DEFAULT_CONFIG.exclude,
}: WhyRNProps): React.ReactElement | null {
  // Hard-guard: never enable in production builds regardless of props
  const isEnabled = enabled && IS_DEV;

  // Inline regex literals are new objects on every render; key on their source.
  const includeKey = include.map(String).join('|');
  const excludeKey = exclude.map(String).join('|');

  const config = useMemo<WhyRNConfig>(
    () => ({
      enabled: isEnabled,
      report,
      criticalMs,
      editor,
      trackHooks,
      logToConsole,
      heatmap,
      flashDuration,
      flashColor,
      heatmapColdColor,
      heatmapHotColor,
      maxOverlays,
      include,
      exclude,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isEnabled, report, criticalMs, editor, trackHooks, logToConsole, heatmap,
      flashDuration, flashColor, heatmapColdColor, heatmapHotColor,
      maxOverlays, includeKey, excludeKey,
    ]
  );

  useLayoutEffect(() => {
    if (!config.enabled) return;

    installCommitTracker();
    setConfig(config);

    return () => {
      setConfig(null);
    };
  }, [config]);

  useLayoutEffect(() => {
    return () => resetTracking();
  }, []);

  if (!isEnabled) {
    return <>{children}</>;
  }

  return (
    <WhyRNContext.Provider value={config}>
      {children}
      <OverlayContainer config={config} />
    </WhyRNContext.Provider>
  );
}

// Subscribe to commits as early as possible (on import), so the very first
// re-render after <WhyRN> mounts is already observed.
installCommitTracker();
