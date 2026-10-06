import { useRef } from 'react';
import { IS_DEV } from '../constants';

export function useRenderCount(componentName?: string): number {
  const countRef = useRef(0);

  if (!IS_DEV) return countRef.current;

  countRef.current++;

  if (componentName && countRef.current > 1) {
    console.log(`🔁 ${componentName} render #${countRef.current}`);
  }

  return countRef.current;
}
