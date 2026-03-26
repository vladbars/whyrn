import { useRef } from 'react';

export function useRenderCount(componentName?: string): number {
  const countRef = useRef(0);
  countRef.current++;

  if (componentName && countRef.current > 1) {
    console.log(`🔁 ${componentName} render #${countRef.current}`);
  }

  return countRef.current;
}
