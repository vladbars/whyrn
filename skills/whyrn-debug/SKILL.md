---
name: whyrn-debug
description: Find out why React Native components re-render and fix the unnecessary renders, using the whyrn.dev library. Installs and wires up <WhyRN> if missing, reads the re-render reasons from Metro logs (props by reference vs value, useState/useReducer, context, external stores, parent renders), and applies targeted fixes such as useMemo, useCallback, React.memo, splitting context or narrowing store selectors. Use when a React Native or Expo screen feels slow or janky, a FlatList stutters, a component "renders too often", or the user asks why something re-renders.
---

# Debugging React Native re-renders with WhyRN

`whyrn.dev` observes React commits and, for every component that re-rendered,
reports **why**: which prop changed (and whether only its reference changed),
which `useState`/`useReducer` value changed, which context value changed, or
that the parent simply rendered. It prints that to Metro and draws a flashing
box with a badge on the device.

Do not guess at re-render causes from reading code. Measure first, then fix
the cause the log names, then measure again.

## 1. Check the project

- Confirm it is React Native or Expo (`react-native` in `package.json`).
  WhyRN needs React 18+ and React Native 0.70+.
- Detect the package manager from the lockfile (`bun.lock`, `yarn.lock`,
  `pnpm-lock.yaml`, `package-lock.json`) and use that one.
- If `whyrn.dev` is not a dependency, install it **as a dev dependency**:

  ```bash
  npm install -D whyrn.dev     # or: yarn add -D / pnpm add -D / bun add -d
  ```

  No native module, no Babel plugin, no pod install. Works in Expo Go.

## 2. Wrap the app root

Find the root component: `App.tsx` for bare apps and classic Expo,
`app/_layout.tsx` for expo-router. Wrap what it renders:

```tsx
import { WhyRN } from 'whyrn.dev';

export default function App() {
  return (
    <WhyRN>
      <RootNavigator />
    </WhyRN>
  );
}
```

Narrow the scope when the user names a screen or component — otherwise the
log is noisy:

```tsx
<WhyRN include={[/ProductList/, /ProductRow/]}>
```

`include`/`exclude` are regexes matched against component names. React Native
internals (`View`, `Text`, `Pressable`, `Animated*`, `RCT*`) are always
skipped. `<WhyRN>` is inert when `__DEV__` is false, so leaving it in place is
safe for release builds.

To track a single component without touching the root, use
`export default withWhyRN(ProductRow)` — it returns the same component, with
no wrapper view.

## 3. Reproduce and read the log

Ask the user to perform the slow interaction (scroll, type, open the screen),
or run the app yourself if you can drive a simulator. Every re-render is
printed to Metro like this:

```
🔁 ProductRow re-rendered (#42)
  prop "onPress" changed (new function reference)
🔁 ProductRow re-rendered (#43)
  prop "item" changed (new reference, same value): {"id":1} → {"id":1}
🔁 CartBadge re-rendered (#7)
  External store changed (useSyncExternalStore)
🔁 Header re-rendered (#12)
  Parent re-rendered
```

Save the Metro output to a file and summarize it — this ranks components by
render count and groups their reasons:

```bash
node "$WHYRN_DEBUG_SKILL_DIR/scripts/summarize-log.mjs" metro.log
```

Resolve `WHYRN_DEBUG_SKILL_DIR` as the directory containing this `SKILL.md`
(in an app it is usually `node_modules/whyrn.dev/skills/whyrn-debug`). The
script also reads from stdin.

## 4. Fix what the log names

| Log line | Cause | Fix |
|---|---|---|
| `prop "x" changed (new reference, same value)` | Object or array literal created during the parent's render | `useMemo` in the parent, or hoist the constant out of the component |
| `prop "onX" changed (new function reference)` | Inline arrow function / unmemoized handler | `useCallback` in the parent (with correct deps) |
| `prop "x" changed: a → b` | A real value change | Usually correct. Only act if the value changes more often than the UI needs |
| `state[i] changed: a → b` | The component's own `useState`/`useReducer` (index = hook order) | Expected, unless the state is set redundantly or should live lower in the tree |
| `XContext value changed` | Provider passes a new `value` object each render | `useMemo` the provider value; split fast-changing and slow-changing data into separate contexts |
| `External store changed (useSyncExternalStore)` | Store selector returns a new object/array | Select primitives, or use a shallow-equal selector (e.g. `useShallow` in Zustand) |
| `Parent re-rendered` | Props are shallow-equal — nothing changed for this component | Wrap the component in `React.memo` (props must then be stable — see the first two rows) |
| `Parent re-rendered (new children)` | Parent passes new JSX `children` | Expected for wrappers; memoize the children or restructure if it matters |

Rules:

- Fix the **highest-count** components first; one parent fix often removes
  dozens of child renders.
- `React.memo` only helps once the props are stable. Add it together with the
  `useMemo`/`useCallback` fixes, not instead of them.
- Do not memoize everything. A component that renders a few times per
  interaction is fine.
- In `FlatList`/`FlashList`, check `renderItem`, `keyExtractor` and
  `extraData` first: they are the usual source of row re-renders.
- If the project uses the React Compiler, most manual memoization is already
  done; look for context and store causes instead.

## 5. Verify

Reproduce the same interaction and summarize the new log. Report the before
and after render counts for the components you changed. If a count did not
drop, read its new reason — the first fix often reveals the next cause.

## 6. Finish

- `<WhyRN>` may stay in the codebase: it does nothing in release builds. Ask
  the user before removing it or keeping a narrowed `include`.
- Do not commit, push or publish unless the user asked for it.

## Reference

- `<WhyRN>` props: `enabled` (`__DEV__`), `heatmap`, `include`, `exclude`,
  `trackHooks` (`true`), `logToConsole` (`true`), `flashDuration` (`600`),
  `flashColor`, `heatmapColdColor`, `heatmapHotColor`, `maxOverlays` (`50`).
- `useWhyRN(name, props)` returns the reasons for the current render as data.
- `useRenderCount(name?)` returns the render count and optionally logs it.
- Docs: https://whyrn.dev · https://github.com/vladbars/whyrn
