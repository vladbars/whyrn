import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { OverlayEntry, RenderReason } from '../types';
import { truncate } from '../utils';

export const BADGE_MAX_WIDTH = 300;

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
      return reason.detail ?? 'context';
    case 'hooks':
      return reason.detail ?? 'hook changed';
    case 'parent':
      return reason.detail ?? 'parent';
  }
}

/** Rendered inside FlashOverlay, so it fades together with the border. */
export function ReasonBadge({ entry }: ReasonBadgeProps): React.ReactElement {
  const label = entry.event.reasons.map(reasonToLine).join(' | ');

  return (
    <View pointerEvents="none" style={styles.badge}>
      <Text style={styles.text} numberOfLines={1}>
        {entry.event.componentName} — {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -16,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: BADGE_MAX_WIDTH,
  },
  text: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
