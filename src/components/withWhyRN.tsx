import type React from 'react';
import { getComponentName, registerForced } from '../utils';
import { installCommitTracker } from '../core/commitTracker';
import { IS_DEV } from '../constants';

const MEMO_TYPE = Symbol.for('react.memo');

/**
 * Track a specific component, even outside <WhyRN> (console only in that case).
 * Returns the same component: no wrapper, no extra views, no changed identity.
 */
export function withWhyRN<C extends React.ComponentType<any>>(Component: C, name?: string): C {
  if (!IS_DEV) return Component;

  const displayName = name ?? getComponentName(Component as any);

  let layer: any = Component;
  while (layer && (typeof layer === 'function' || typeof layer === 'object')) {
    registerForced(layer, displayName);
    layer = layer.$$typeof === MEMO_TYPE ? layer.type : null;
  }

  installCommitTracker();
  return Component;
}
