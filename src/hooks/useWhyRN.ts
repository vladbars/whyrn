import { useRef, useEffect } from 'react';
import type { RenderReason } from '../types';
import { diffProps, buildReasons } from '../core/differ';
import { trackRender } from '../core/tracker';
import { getConfig } from '../utils';

export function useWhyRN(
  componentName: string,
  props: Record<string, unknown>
): RenderReason[] {
  const prevPropsRef = useRef<Record<string, unknown> | null>(null);
  const renderCountRef = useRef(0);
  const reasonsRef = useRef<RenderReason[]>([]);

  renderCountRef.current++;

  if (renderCountRef.current > 1 && prevPropsRef.current !== null) {
    const propChanges = diffProps(prevPropsRef.current, props);
    reasonsRef.current = buildReasons(propChanges, []);
  } else {
    reasonsRef.current = [];
  }

  useEffect(() => {
    prevPropsRef.current = { ...props };
  });

  useEffect(() => {
    if (renderCountRef.current > 1 && reasonsRef.current.length > 0) {
      const config = getConfig();
      if (config?.enabled !== false) {
        trackRender(componentName, reasonsRef.current, undefined);
      }
    }
  });

  return reasonsRef.current;
}
