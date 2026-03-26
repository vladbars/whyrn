import React, { useRef, useCallback } from 'react';
import { View } from 'react-native';
import type { ComponentLayout } from '../types';
import { diffProps, buildReasons } from './differ';
import { trackRender } from './tracker';

export function createTrackedComponent(
  OriginalComponent: React.ComponentType<any>,
  displayName: string
): React.ComponentType<any> {
  const Tracked = React.forwardRef((props: Record<string, unknown>, ref) => {
    const prevPropsRef = useRef<Record<string, unknown> | null>(null);
    const layoutRef = useRef<ComponentLayout | undefined>(undefined);
    const viewRef = useRef<View>(null);
    const renderCountRef = useRef(0);

    renderCountRef.current++;

    if (renderCountRef.current > 1) {
      const propChanges = diffProps(prevPropsRef.current, props);
      const reasons = buildReasons(propChanges, []);

      if (viewRef.current) {
        (viewRef.current as any).measureInWindow?.(
          (x: number, y: number, width: number, height: number) => {
            if (width > 0 && height > 0) {
              layoutRef.current = { x, y, width, height };
              trackRender(displayName, reasons, layoutRef.current);
            } else {
              trackRender(displayName, reasons, undefined);
            }
          }
        );
      } else {
        trackRender(displayName, reasons, undefined);
      }
    }

    prevPropsRef.current = { ...props };

    const onLayout = useCallback(() => {
      viewRef.current?.measureInWindow?.(
        (x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            layoutRef.current = { x, y, width, height };
          }
        }
      );
    }, []);

    return (
      <View ref={viewRef} onLayout={onLayout} collapsable={false}>
        <OriginalComponent {...props} ref={ref} />
      </View>
    );
  });

  Tracked.displayName = `WhyRN(${displayName})`;

  return Tracked;
}
