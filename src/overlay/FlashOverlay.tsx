import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { OverlayEntry } from '../types';

interface FlashOverlayProps {
  entry: OverlayEntry;
  color: string;
  duration: number;
  onComplete: (id: string) => void;
}

export const FlashOverlay: React.FC<FlashOverlayProps> = ({
  entry,
  color,
  duration,
  onComplete,
}) => {
  const fadeAnim = useRef(entry.opacity).current;

  useEffect(() => {
    fadeAnim.setValue(1);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    }).start(() => {
      onComplete(entry.id);
    });
  }, [fadeAnim, duration, entry.id, onComplete]);

  const layout = entry.event.layout;
  if (!layout) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        {
          left: layout.x,
          top: layout.y,
          width: layout.width,
          height: layout.height,
          borderColor: color,
          opacity: fadeAnim,
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
});
