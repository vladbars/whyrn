import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import type { RenderEvent, OverlayEntry, WhyRNConfig } from '../types';
import { overlayManager } from './OverlayManager';
import { FlashOverlay } from './FlashOverlay';
import { ReasonBadge } from './ReasonBadge';
import { getHeatColor } from './Heatmap';
import { getRecentRenderRate } from '../core/tracker';
import { uniqueId } from '../utils';

interface OverlayContainerProps {
  config: WhyRNConfig;
}

export const OverlayContainer: React.FC<OverlayContainerProps> = ({ config }) => {
  const [entries, setEntries] = useState<OverlayEntry[]>([]);

  useEffect(() => {
    const unsubscribe = overlayManager.subscribe((event: RenderEvent) => {
      if (!event.layout) return;

      const entry: OverlayEntry = {
        id: uniqueId(),
        event,
        opacity: new Animated.Value(1),
      };

      setEntries((prev) => {
        const next = [...prev, entry];
        if (next.length > config.maxOverlays) {
          return next.slice(next.length - config.maxOverlays);
        }
        return next;
      });
    });

    return unsubscribe;
  }, [config.maxOverlays]);

  const handleComplete = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  if (entries.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {entries.map((entry) => {
        const color = config.heatmap
          ? getHeatColor(
              getRecentRenderRate(entry.event.componentName),
              config.heatmapColdColor,
              config.heatmapHotColor
            )
          : config.flashColor;

        return (
          <React.Fragment key={entry.id}>
            <FlashOverlay
              entry={entry}
              color={color}
              duration={config.flashDuration}
              onComplete={handleComplete}
            />
            <ReasonBadge entry={entry} />
          </React.Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
    elevation: 999999,
  },
});
