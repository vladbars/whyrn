---
name: whyrn-debug
description: Find out why React Native components re-render and fix the unnecessary renders, using the whyrn.dev library. Installs and wires up <WhyRN> if missing, reads the re-render reasons from Metro logs (props by reference vs value, useState/useReducer, context, external stores, parent renders), and applies targeted fixes such as useMemo, useCallback, React.memo, splitting context or narrowing store selectors. Use when a React Native or Expo screen feels slow or janky, a FlatList stutters, a component "renders too often", or the user asks why something re-renders.
---

# Debugging React Native re-renders with WhyRN

`whyrn.dev` observes React commits and reports the **avoidable** re-renders:
components that rendered although nothing they depend on really changed - a
new function or an object with the same content as a prop, a context value
with the same content, or equal props from a parent that rendered. For each it
names the parent to fix and the fix (`useCallback`, `useMemo`, `React.memo`).
It prints a summary to Metro and flashes a box with a badge on the device.

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

Narrow the scope when the user names a screen or component - otherwise the
log is noisy:

```tsx
<WhyRN include={[/ProductList/, /ProductRow/]}>
```

`include`/`exclude` are regexes matched against component names. React Native
internals (`View`, `Text`, `Pressable`, `Animated*`, `RCT*`) are always
skipped. `<WhyRN>` is inert when `__DEV__` is false, so leaving it in place is
safe for release builds.

To track a single component without touching the root, use
`export default withWhyRN(ProductRow)` - it returns the same component, with
no wrapper view.

## 3. Reproduce and read the log

Ask the user to perform the slow interaction (scroll, type, open the screen),
or run the app yourself if you can drive a simulator.

By default (`report="critical"`) WhyRN reports only re-renders that are both
**avoidable** (nothing the component depends on really changed) and **costly**
(they wasted at least `criticalMs`, 16 ms by default, of render time in a
second - measured with React's own profiling timers). Legitimate renders and
cheap ones stay quiet, so everything in the log is worth fixing. Metro gets one
summary per second, naming the parent that creates the unstable prop:

```
⚠️ WhyRN: 402 avoidable re-renders
  HeavyList ×2 · 33 ms wasted · rendered by Screen
    at vscode://file/Users/you/app/src/screens/Screen.tsx:148:7
    2× prop "items": new object with the same content - useMemo in Screen, then React.memo(HeavyList)
  Row ×400 · 200 instances · rendered by HeavyList
    400× only because HeavyList re-rendered - fix HeavyList first
```

- `×N` counts renders across all instances; `K instances` says how many
  distinct components rendered. `Icon ×12 · 12 instances` means twelve icons
  rendered once each, not one icon twelve times.
- `only because X re-rendered - fix X first` is a consequence. Fix `X`; do not
  add `React.memo` to the children first.
- Sort by `ms wasted`, not by `×N`.
- `at vscode://file/abs/path/File.tsx:line:col` is the JSX that renders the
  component. Strip the `vscode://file` prefix (or the editor scheme in use) to
  get the file path; open that file and line - the unstable prop is created
  right there.

A problem is explained once; later occurrences are summarized every 10 s (count, wasted time, link):

```
⚠️ WhyRN: still avoidable (same causes as above)
  HeavyList ×10 · 140 ms wasted · rendered by Screen
    at vscode://file/Users/you/app/src/screens/Screen.tsx:148:7
```

If a screen is slow but the summary is empty:

1. `report="avoidable"` lists every wasted render, however cheap - useful when
   many small ones add up, or to lower `criticalMs` for a slow device.
2. `report="all"` shows every render with its real cause (state, props,
   context). If the slow component renders legitimately, reduce how often that
   state changes, move it lower in the tree, or virtualize the list.

Save the Metro output to a file and summarize it - this ranks components by
render count and groups their causes (works for both formats):

```bash
node "$WHYRN_DEBUG_SKILL_DIR/scripts/summarize-log.mjs" metro.log
```

Resolve `WHYRN_DEBUG_SKILL_DIR` as the directory containing this `SKILL.md`
(in an app it is usually `node_modules/whyrn.dev/skills/whyrn-debug`). The
script also reads from stdin.

## 4. Fix what the log names

| Summary line | Cause | Fix |
|---|---|---|
| `prop "x": new object with the same content - useMemo in P` | Object/array/JSX literal created during `P`'s render | `useMemo` in `P`, or hoist the constant out of the component |
| `prop "onX": new function every render - useCallback in P` | Inline arrow function / unmemoized handler in `P` | `useCallback` in `P` (with correct deps) |
| `props are equal - wrap C in React.memo` | `C` re-renders only because its parent did | `React.memo(C)` |
| `… (they defeat React.memo(C))` | `C` is memoized, but receives unstable props | Fix the props in the parent; the memo then starts working |
| `XContext got a new value with the same content - useMemo the Provider value` | Provider passes a new `value` object each render | `useMemo` the provider value; split fast- and slow-changing data into separate contexts |
| `Store selector returned a new object with the same content` | Selector builds a new object/array | Select primitives, or use a shallow-equal selector (e.g. `useShallow` in Zustand) |
| `state[i] set to an equal value - keep the previous object` | `setState` called with a fresh but equal object | Return the previous state when nothing changed |

With `report="all"`, the per-render lines mean: `prop "x" changed: a → b` and
`state[i] changed: a → b` are real changes (usually fine); `XContext value
changed` means the provider value really changed - consider splitting the
context if this consumer only needs part of it.

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
drop, read its new reason - the first fix often reveals the next cause.

## 6. Finish

- `<WhyRN>` may stay in the codebase: it does nothing in release builds. Ask
  the user before removing it or keeping a narrowed `include`.
- Do not commit, push or publish unless the user asked for it.

## Reference

- `<WhyRN>` props: `enabled` (`__DEV__`), `report` (`'critical'` | `'avoidable'` | `'all'`), `criticalMs` (`16`), `heatmap`, `include`, `exclude`,
  `trackHooks` (`true`), `logToConsole` (`true`), `flashDuration` (`600`),
  `flashColor`, `heatmapColdColor`, `heatmapHotColor`, `maxOverlays` (`50`).
- `heatmap` keeps a box per component instance, colored by its render rate in
  the last 5 s, with a `×N` count - useful to find the hottest spot on screen.
- `useWhyRN(name, props)` returns the reasons for the current render as data.
- `useRenderCount(name?)` returns the render count and optionally logs it.
- Docs: https://whyrn.dev · https://github.com/vladbars/whyrn
