import React, { useEffect, useMemo, useRef } from 'react';
import type { WhyRNProps, WhyRNConfig } from '../types';
import { DEFAULT_CONFIG } from '../constants';
import { setConfig } from '../utils';
import { patchReact, unpatchReact } from '../core/patcher';
import { patchHooks, unpatchHooks } from '../core/hookPatcher';
import { OverlayContainer } from '../overlay/OverlayContainer';
import { resetTracking } from '../core/tracker';
import { overlayManager } from '../overlay/OverlayManager';

export const WhyRNContext = React.createContext<WhyRNConfig>(DEFAULT_CONFIG);

export const WhyRN: React.FC<WhyRNProps> = ({
  children,
  enabled = DEFAULT_CONFIG.enabled,
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
}) => {
  const config = useMemo<WhyRNConfig>(
    () => ({
      enabled,
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
    [
      enabled, trackHooks, logToConsole, heatmap,
      flashDuration, flashColor, heatmapColdColor, heatmapHotColor,
      maxOverlays, include, exclude,
    ]
  );

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!config.enabled) return;

    setConfig(config);

    if (!initializedRef.current) {
      patchReact(config);
      if (config.trackHooks) {
        patchHooks(config);
      }
      initializedRef.current = true;
    }

    return () => {
      unpatchReact();
      unpatchHooks();
      resetTracking();
      overlayManager.clear();
      setConfig(DEFAULT_CONFIG);
      initializedRef.current = false;
    };
  }, [config]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <WhyRNContext.Provider value={config}>
      {children}
      <OverlayContainer config={config} />
    </WhyRNContext.Provider>
  );
};
