import React, { useRef, useCallback } from 'react';
import { View } from 'react-native';
import type { ComponentLayout } from '../types';
import { diffProps, buildReasons } from '../core/differ';
import { trackRender } from '../core/tracker';
import { getComponentName, getConfig } from '../utils';

export function withWhyRN<P extends Record<string, unknown>>(
  WrappedComponent: React.ComponentType<P>,
  name?: string
): React.ComponentType<P> {
  const displayName = name ?? getComponentName(WrappedComponent as React.ComponentType<unknown>);

  const TrackedComponent = React.forwardRef<unknown, P>((props, ref) => {
    const prevPropsRef = useRef<Record<string, unknown> | null>(null);
    const layoutRef = useRef<ComponentLayout | undefined>(undefined);
    const viewRef = useRef<View>(null);
    const renderCountRef = useRef(0);

    renderCountRef.current++;

    if (renderCountRef.current > 1) {
      const config = getConfig();
      if (config?.enabled !== false) {
        const propChanges = diffProps(prevPropsRef.current, props as Record<string, unknown>);
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
    }

    prevPropsRef.current = { ...(props as Record<string, unknown>) };

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
        <WrappedComponent {...(props as P)} ref={ref} />
      </View>
    );
  });

  TrackedComponent.displayName = `withWhyRN(${displayName})`;

  return TrackedComponent as unknown as React.ComponentType<P>;
}
