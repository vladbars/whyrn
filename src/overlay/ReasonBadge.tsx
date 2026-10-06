import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { OverlayEntry, RenderEvent, RenderReason } from '../types';
import { truncate } from '../utils';

export const BADGE_MAX_WIDTH = 300;

interface ReasonBadgeProps {
  entry: OverlayEntry;
}

function reasonToLine(reason: RenderReason): string | null {
  switch (reason.type) {
    case 'props': {
      const changes = reason.propChanges ?? [];
      const fns = changes.filter((c) => c.kind === 'function').map((c) => c.key);
      const same = changes.filter((c) => c.kind === 'reference').map((c) => c.key);
      const real = changes.filter((c) => c.kind === 'value').map((c) => c.key);
      const parts: string[] = [];
      if (real.length) parts.push(`props: ${real.join(', ')}`);
      if (fns.length) parts.push(`new fn: ${fns.join(', ')}`);
      if (same.length) parts.push(`same value: ${same.join(', ')}`);
      return parts.join(' · ') || null;
    }
    case 'state':
      return (reason.stateChanges ?? [])
        .map((c) =>
          c.equivalent
            ? `${c.hookName}: equal value`
            : `${c.hookName}: ${truncate(c.prev, 12)} → ${truncate(c.next, 12)}`
        )
        .join(', ');
    case 'context':
    case 'hooks':
      return reason.detail ?? reason.type;
    case 'parent':
      return null;
  }
}

/** Short, badge-sized description of why a component rendered. */
export function reasonLabel(event: RenderEvent): string {
  const label = event.reasons
    .map(reasonToLine)
    .filter((line): line is string => !!line)
    .join(' | ');
  return label || (event.avoidable ? 'equal props' : 'parent re-rendered');
}

/** Rendered inside FlashOverlay, so it fades together with the border. */
export function ReasonBadge({ entry }: ReasonBadgeProps): React.ReactElement {
  return (
    <View pointerEvents="none" style={styles.badge}>
      <Text style={styles.text} numberOfLines={1}>
        {entry.event.componentName} — {reasonLabel(entry.event)}
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
