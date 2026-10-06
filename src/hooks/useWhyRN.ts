import { useRef, useEffect } from 'react';
import type { RenderReason } from '../types';
import { diffProps, buildReasons } from '../core/differ';
import { recordRender } from '../core/tracker';
import { IS_DEV } from '../constants';

export function useWhyRN(
  componentName: string,
  props: Record<string, unknown>
): RenderReason[] {
  const prevPropsRef = useRef<Record<string, unknown> | null>(null);
  const renderCountRef = useRef(0);
  const reasonsRef = useRef<RenderReason[]>([]);

  if (!IS_DEV) return reasonsRef.current;

  renderCountRef.current++;

  if (renderCountRef.current > 1 && prevPropsRef.current !== null) {
    const reasons = buildReasons(diffProps(prevPropsRef.current, props), []);
    if (reasons[0]?.type === 'parent' && prevPropsRef.current === props) {
      reasons[0].detail = 'Own state/context update (props unchanged)';
    }
    reasonsRef.current = reasons;
  } else {
    reasonsRef.current = [];
  }

  useEffect(() => {
    prevPropsRef.current = props;
    if (renderCountRef.current > 1 && reasonsRef.current.length > 0) {
      recordRender(componentName, reasonsRef.current);
    }
  });

  return reasonsRef.current;
}
