import React from 'react';
import type { WhyRNConfig } from '../types';

let patched = false;
let originalUseState: typeof React.useState | null = null;
let originalUseReducer: typeof React.useReducer | null = null;
let originalUseContext: typeof React.useContext | null = null;

type StateListener = (hookIndex: number, prev: unknown, next: unknown) => void;

let activeListener: StateListener | null = null;
let hookIndex = 0;

export function setActiveListener(listener: StateListener | null): void {
  activeListener = listener;
  hookIndex = 0;
}

export function resetHookIndex(): void {
  hookIndex = 0;
}

export function patchHooks(_config: WhyRNConfig): void {
  if (patched) return;
  patched = true;

  originalUseState = React.useState;
  originalUseReducer = React.useReducer;
  originalUseContext = React.useContext;

  (React as Record<string, unknown>).useState = function patchedUseState<S>(
    initialState: S | (() => S)
  ) {
    const idx = hookIndex++;
    const [state, originalSetState] = originalUseState!(initialState);

    const setState = React.useCallback(
      (action: S | ((prev: S) => S)) => {
        originalSetState((prev: S) => {
          const next = typeof action === 'function'
            ? (action as (prev: S) => S)(prev)
            : action;
          if (!Object.is(prev, next) && activeListener) {
            activeListener(idx, prev, next);
          }
          return next;
        });
      },
      [idx, originalSetState]
    );

    return [state, setState] as [S, React.Dispatch<React.SetStateAction<S>>];
  };

  (React as Record<string, unknown>).useReducer = function patchedUseReducer<S, A>(
    reducer: (state: S, action: A) => S,
    initialArg: S,
    init?: (arg: S) => S
  ) {
    const idx = hookIndex++;
    const wrappedReducer = React.useCallback(
      (state: S, action: A) => {
        const next = reducer(state, action);
        if (!Object.is(state, next) && activeListener) {
          activeListener(idx, state, next);
        }
        return next;
      },
      [reducer, idx]
    );

    if (init) {
      return originalUseReducer!(wrappedReducer, initialArg, init);
    }
    return originalUseReducer!(wrappedReducer, initialArg);
  };

  (React as Record<string, unknown>).useContext = function patchedUseContext<T>(
    context: React.Context<T>
  ) {
    hookIndex++;
    return originalUseContext!(context);
  };
}

export function unpatchHooks(): void {
  if (!patched) return;
  if (originalUseState) (React as Record<string, unknown>).useState = originalUseState;
  if (originalUseReducer) (React as Record<string, unknown>).useReducer = originalUseReducer;
  if (originalUseContext) (React as Record<string, unknown>).useContext = originalUseContext;
  originalUseState = null;
  originalUseReducer = null;
  originalUseContext = null;
  patched = false;
}
