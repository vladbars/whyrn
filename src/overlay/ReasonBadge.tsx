import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import type { OverlayEntry, RenderReason } from '../types';
import { truncate } from '../utils';

interface ReasonBadgeProps {
  entry: OverlayEntry;
}

function reasonToLine(reason: RenderReason): string {
  switch (reason.type) {
    case 'props':
      if (reason.propChanges && reason.propChanges.length > 0) {
        const keys = reason.propChanges.map((c) => c.key).join(', ');
        return `props: ${keys}`;
      }
      return 'props changed';
    case 'state':
      if (reason.stateChanges && reason.stateChanges.length > 0) {
        return reason.stateChanges
          .map((c) => `${c.hookName}: ${truncate(c.prev, 12)} → ${truncate(c.next, 12)}`)
          .join(', ');
      }
      return 'state changed';
    case 'context':
      return 'context';
    case 'hooks':
      return 'hook dep changed';
    case 'parent':
      return reason.detail ?? 'parent';
  }
}

export const ReasonBadge: React.FC<ReasonBadgeProps> = ({ entry }) => {
  const layout = entry.event.layout;
  if (!layout) return null;

  const label = entry.event.reasons.map(reasonToLine).join(' | ');

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.badge,
        {
          left: layout.x,
          top: Math.max(0, layout.y - 20),
          opacity: entry.opacity,
        },
      ]}
    >
      <Text style={styles.text} numberOfLines={1}>
        {entry.event.componentName} — {label}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 300,
  },
  text: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
