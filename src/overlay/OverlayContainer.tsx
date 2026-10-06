import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import type { RenderEvent, OverlayEntry, WhyRNConfig } from '../types';
import { overlayManager } from './OverlayManager';
import { FlashOverlay } from './FlashOverlay';
import { HeatmapLayer } from './HeatmapLayer';
import { uniqueId, internalComponents } from '../utils';

function entryKey(entry: OverlayEntry): string {
  const layout = entry.event.layout;
  return `${entry.event.componentName}@${layout?.x},${layout?.y}`;
}

interface OverlayContainerProps {
  config: WhyRNConfig;
}

// The commit tracker never inspects this subtree, so overlay updates can't
// trigger reports about themselves (which would loop forever).
internalComponents.add(OverlayContainer);

export function OverlayContainer({ config }: OverlayContainerProps): React.ReactElement | null {
  const [entries, setEntries] = useState<OverlayEntry[]>([]);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const containerRef = useRef<View>(null);
  const queueRef = useRef<OverlayEntry[]>([]);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // The heatmap keeps its own persistent cells.
    if (config.heatmap) return;

    const flush = () => {
      frameRef.current = null;
      const batch = queueRef.current;
      queueRef.current = [];
      // A newer flash for the same component and spot replaces the older one.
      const keys = new Set(batch.map(entryKey));
      setEntries((prev) => {
        const next = [...prev.filter((e) => !keys.has(entryKey(e))), ...batch];
        return next.length > config.maxOverlays
          ? next.slice(next.length - config.maxOverlays)
          : next;
      });
    };

    const unsubscribe = overlayManager.subscribe((event: RenderEvent) => {
      queueRef.current.push({ id: uniqueId(), event, opacity: new Animated.Value(1) });
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
    });

    return () => {
      unsubscribe();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      queueRef.current = [];
    };
  }, [config.maxOverlays, config.heatmap]);

  const handleComplete = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Layouts are measured in window coordinates; this container may be offset.
  const onLayout = useCallback(() => {
    containerRef.current?.measureInWindow((x, y) => {
      setOrigin((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
    });
  }, []);

  return (
    <View ref={containerRef} style={styles.container} pointerEvents="none" onLayout={onLayout}>
      {config.heatmap ? (
        <HeatmapLayer config={config} origin={origin} />
      ) : (
        entries.map((entry) => (
          <FlashOverlay
            key={entry.id}
            entry={entry}
            origin={origin}
            color={config.flashColor}
            duration={config.flashDuration}
            onComplete={handleComplete}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
    elevation: 999999,
  },
});
