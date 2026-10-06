import React, { useEffect } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { OverlayEntry } from '../types';
import { ReasonBadge, BADGE_MAX_WIDTH } from './ReasonBadge';

interface FlashOverlayProps {
  entry: OverlayEntry;
  origin: { x: number; y: number };
  color: string;
  duration: number;
  onComplete: (id: string) => void;
}

export function FlashOverlay({
  entry,
  origin,
  color,
  duration,
  onComplete,
}: FlashOverlayProps): React.ReactElement | null {
  const fadeAnim = entry.opacity;

  useEffect(() => {
    fadeAnim.setValue(1);
    const animation = Animated.timing(fadeAnim, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    });
    animation.start(() => onComplete(entry.id));
    return () => animation.stop();
  }, [fadeAnim, duration, entry.id, onComplete]);

  const layout = entry.event.layout;
  if (!layout) return null;

  // The outer view is wider than the component so short components still get
  // a readable badge; only the inner view draws the border.
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          left: layout.x - origin.x,
          top: layout.y - origin.y,
          width: Math.max(layout.width, BADGE_MAX_WIDTH),
          height: layout.height,
          opacity: fadeAnim,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.border, { width: layout.width, height: layout.height, borderColor: color }]}
      />
      <ReasonBadge entry={entry} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
  border: {
    borderWidth: 2,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
});
