import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { ComponentLayout, RenderEvent, WhyRNConfig } from '../types';
import { overlayManager } from './OverlayManager';
import { getHeatColor } from './Heatmap';
import { reasonLabel } from './ReasonBadge';

const WINDOW_MS = 5000;
const TICK_MS = 250;
/** Renders per WINDOW_MS that count as fully hot. */
const HOT_RATE = 10;
/** The reason is shown on the badge for this long after the last render. */
const REASON_MS = 1200;

interface Cell {
  key: string;
  name: string;
  layout: ComponentLayout;
  stamps: number[];
  reason: string;
}

interface HeatmapLayerProps {
  config: WhyRNConfig;
  origin: { x: number; y: number };
}

/** One cell per component instance (by position), so seven tabs don't add up into one hot "Tab". */
function cellKey(event: RenderEvent & { layout: ComponentLayout }): string {
  const { x, y, width, height } = event.layout;
  return `${event.componentName}@${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`;
}

/**
 * Persistent heatmap: every re-rendered component keeps a tinted box while it
 * keeps rendering. Color goes cold → hot with the render count in the last
 * 5 s; the box fades out once the component stops rendering.
 */
export function HeatmapLayer({ config, origin }: HeatmapLayerProps): React.ReactElement {
  const cells = useRef(new Map<string, Cell>());
  const [, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const ensureTicking = () => {
      if (timer.current !== null) return;
      timer.current = setInterval(() => {
        const now = Date.now();
        for (const [key, cell] of cells.current) {
          cell.stamps = cell.stamps.filter((t) => now - t < WINDOW_MS);
          if (cell.stamps.length === 0) cells.current.delete(key);
        }
        if (cells.current.size === 0 && timer.current !== null) {
          clearInterval(timer.current);
          timer.current = null;
        }
        setTick((t) => t + 1);
      }, TICK_MS);
    };

    const unsubscribe = overlayManager.subscribe((event: RenderEvent) => {
      if (!event.layout) return;
      const withLayout = event as RenderEvent & { layout: ComponentLayout };
      const key = cellKey(withLayout);
      const cell = cells.current.get(key) ?? {
        key,
        name: event.componentName,
        layout: withLayout.layout,
        stamps: [],
        reason: '',
      };

      cell.stamps.push(event.timestamp);
      cell.layout = withLayout.layout;
      cell.reason = reasonLabel(event);
      cells.current.set(key, cell);

      if (cells.current.size > config.maxOverlays) {
        const oldest = [...cells.current.values()].sort(
          (a, b) => a.stamps[a.stamps.length - 1] - b.stamps[b.stamps.length - 1]
        )[0];
        if (oldest) cells.current.delete(oldest.key);
      }

      ensureTicking();
    });

    return () => {
      unsubscribe();
      if (timer.current !== null) clearInterval(timer.current);
      timer.current = null;
    };
  }, [config.maxOverlays]);

  const now = Date.now();

  return (
    <>
      {[...cells.current.values()].map((cell) => {
        const count = cell.stamps.length;
        const last = cell.stamps[count - 1] ?? now;
        const age = now - last;
        const color = getHeatColor(count, config.heatmapColdColor, config.heatmapHotColor, HOT_RATE);
        const opacity = 0.35 + 0.65 * Math.max(0, 1 - age / WINDOW_MS);
        const { x, y, width, height } = cell.layout;

        return (
          <React.Fragment key={cell.key}>
            <View
              pointerEvents="none"
              style={[
                styles.cell,
                {
                  left: x - origin.x,
                  top: y - origin.y,
                  width,
                  height,
                  opacity,
                  borderColor: color,
                  backgroundColor: `${color}1f`,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.badge,
                // Clamp in window coordinates: the container itself may sit anywhere.
                { left: x - origin.x, top: Math.max(0, y - 15) - origin.y, opacity, backgroundColor: color },
              ]}
            >
              <Text style={styles.text} numberOfLines={1}>
                {cell.name} ×{count}
                {age < REASON_MS && cell.reason ? ` · ${cell.reason}` : ''}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 3,
  },
  badge: {
    position: 'absolute',
    maxWidth: 280,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  text: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
