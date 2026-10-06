<p align="center">
  <img src="https://raw.githubusercontent.com/vladbars/whyrn/main/assets/logo.svg" alt="WhyRN" width="120" />
</p>

<h1 align="center">WhyRN</h1>

<p align="center">
  See exactly <strong>why</strong> your React Native components re-render.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/whyrn.dev"><img src="https://img.shields.io/npm/v/whyrn.dev.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/whyrn.dev"><img src="https://img.shields.io/npm/dm/whyrn.dev.svg" alt="npm downloads" /></a>
  <a href="https://github.com/vladbars/whyrn/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/whyrn.dev.svg" alt="license" /></a>
</p>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/vladbars/whyrn/main/assets/demo.gif" alt="WhyRN demo: components flash with a badge explaining each re-render" width="320" />
</p>

> Finds the re-renders that cost you frames - and tells you what to change, and where.

---

## Why?

Ever stared at your React Native app and asked:

- *"Why is this re-rendering?"*
- *"Why is my FlatList so laggy?"*
- *"Which prop is causing this?"*

React DevTools can already **highlight** every component that renders, and its Profiler lists "props changed: style". That is a lot of boxes, and most of them are fine: state really changed, so the component had to render.

**WhyRN reports only the renders worth fixing**: nothing the component depends on really changed, *and* those wasted renders cost real time - by default at least 16 ms (a frame) per second. A cheap icon rendering once more stays quiet; a heavy list rebuilt on every tick does not:

```
⚠️ WhyRN: 402 avoidable re-renders
  HeavyList ×2 · 33 ms wasted · rendered by Screen
    at vscode://file/Users/you/app/src/screens/Screen.tsx:148:7
    2× prop "items": new object with the same content - useMemo in Screen, then React.memo(HeavyList)
  Row ×400 · 200 instances · rendered by HeavyList
    400× only because HeavyList re-rendered - fix HeavyList first
```

No DevTools window, no profiling session: it runs in your dev build and writes to Metro.

---

## Features

- 🎯 **Only what costs frames** - avoidable re-renders that waste ≥ 16 ms/s (configurable); real changes and cheap renders stay quiet
- 🔗 **Root cause first** - children that render only because a flagged parent did are listed as consequences, not separate problems
- 🧭 **Jump to the code** - every problem links to the JSX that renders it - click it in the React Native DevTools console and your editor opens at that line (`editor="vscode"` by default; Cursor, Windsurf, Zed, WebStorm, IDEA or your own URL); tap a badge on the device for the same
- 🔍 **Reference vs value** - deep comparison tells a new object with the same content from a real change; inline callbacks are called out
- 🛠️ **Says where to fix it** - names the parent that creates the unstable prop, and whether `useCallback`, `useMemo` or `React.memo` is the fix
- 🧘 **Doesn't flood Metro** - details once per problem, then one short line every 10 s
- 🌡️ **Heatmap** - persistent boxes, cold → hot by how often each instance renders
- 🤖 **Agent skill included** - Claude Code / Codex can measure and fix re-renders for you
- ⚡ **Zero config** - wrap your app, done
- 🪶 **Zero dependencies** - only React and React Native as peers
- 🔇 **Dev only** - hard `__DEV__` guard at every entry point; inert in release builds

---

## Install

Install as a **dev dependency** - whyrn is a debug tool and has no place in production bundles:

```bash
npm install -D whyrn.dev
```

```bash
yarn add -D whyrn.dev
```

---

## Usage

```tsx
import { WhyRN } from 'whyrn.dev';

export default function App() {
  return (
    <WhyRN>
      <YourApp />
    </WhyRN>
  );
}
```

That's it. **No init function, no config files, no babel plugins.**

Every avoidable re-render flashes on screen with a badge, and Metro gets a summary of what to fix.

---

## Example Output

By default (`report="critical"`), only avoidable re-renders that waste real render time are reported, batched into one summary per second. Render time comes from React's own profiling timers, which React Native dev builds enable:

```
⚠️ WhyRN: 402 avoidable re-renders
  HeavyList ×2 · 33 ms wasted · rendered by Screen
    at vscode://file/Users/you/app/src/screens/Screen.tsx:148:7
    2× prop "items": new object with the same content - useMemo in Screen, then React.memo(HeavyList)
  Row ×400 · 200 instances · rendered by HeavyList
    400× only because HeavyList re-rendered - fix HeavyList first
```

`×N` counts renders across all instances; `200 instances` says how many different components that is. `only because X re-rendered` marks consequences: fix `X` and they go away. `at …/File.tsx:line:col` is the JSX in the parent that renders the component - where the unstable prop is created. Click it in the React Native DevTools console and the editor opens at that line (the browser asks once to allow `vscode://` links). Use the `editor` prop for another editor, or `editor="none"` for plain paths in a terminal. Locations come from React's dev element stacks, symbolicated by Metro; tapping a badge opens the same line through Metro's `open-stack-frame` (set `REACT_EDITOR` if the wrong editor opens).

A problem already explained is not repeated in full; repeats are counted and summarized every 10 s, still with links:

```
⚠️ WhyRN: still avoidable (same causes as above)
  HeavyList ×10 · 140 ms wasted · rendered by Screen
    at vscode://file/Users/you/app/src/screens/Screen.tsx:148:7
```

On screen, each avoidable re-render flashes with a short badge (`new fn: onPress`, `same value: user`, `equal props`).

Want every avoidable re-render, cheap ones included? Use `report="avoidable"`. Every render, legitimate ones included? `report="all"`:

```
🔁 Counter re-rendered (#9)
  state[0] changed: 8 → 9
🔁 UserCard re-rendered (#4) - avoidable
  prop "user" changed (new reference, same value): {"name":"Alice"} → {"name":"Alice"}
```

---

## Track Specific Components

Don't want to track everything? Use the HOC:

```tsx
import { withWhyRN } from 'whyrn.dev';

function UserCard({ user }) {
  return <Text>{user.name}</Text>;
}

export default withWhyRN(UserCard);
```

Or the hook, for full control:

```tsx
import { useWhyRN } from 'whyrn.dev';

function UserCard(props) {
  const reasons = useWhyRN('UserCard', props);
  // reasons = [{ type: 'props', propChanges: [...] }]
  return <Text>{props.user.name}</Text>;
}
```

---

## Heatmap Mode

See which component instances re-render the most. Each reported instance keeps a tinted box while it keeps rendering; the color goes cold (blue) → hot (red) with the number of reported renders in the last 5 seconds, and the badge shows the count (`Button ×9 · new fn: onPress`). Boxes fade out once a component stops rendering.

```tsx
<WhyRN heatmap>
  <YourApp />
</WhyRN>
```

<p align="center">
  <img src="https://raw.githubusercontent.com/vladbars/whyrn/main/assets/heatmap.png" alt="Heatmap: components outlined from cold to hot with render counts and reasons" width="360" />
</p>

---

## Configuration

All options are passed as props. Every prop is optional. React Native internals (`View`, `Text`, `Pressable`, `Animated*`, `RCT*`, …) and internals of common libraries (react-navigation, react-native-screens, gesture-handler, fast-image) are always skipped - their props are not yours to fix.

```tsx
<WhyRN
  enabled={__DEV__}              // Kill switch (default: __DEV__)
  report="critical"              // 'critical' | 'avoidable' | 'all' (default: 'critical')
  criticalMs={16}                // Wasted ms per second that make a component critical (default: 16)
  editor="vscode"                // Console links: 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'webstorm' | 'idea' | 'none' | (loc) => url
  trackHooks                     // Track useState/useReducer (default: true)
  logToConsole                   // Log to console (default: true)
  heatmap                        // Heatmap mode (default: false)
  flashDuration={600}            // Flash duration in ms (default: 600)
  flashColor="#FF6B6B"           // Flash border color (default: #FF6B6B)
  heatmapColdColor="#3B82F6"     // Heatmap cold color (default: #3B82F6)
  heatmapHotColor="#EF4444"      // Heatmap hot color (default: #EF4444)
  include={[/Screen/, /Card/]}   // Only track matching names (default: [])
  exclude={[/^Legacy/]}          // Skip matching names (default: [])
>
  <YourApp />
</WhyRN>
```

---

## API Reference

### `<WhyRN>`

Root provider. Tracks every component below it, draws the overlay and logs the summary. See [Configuration](#configuration).

### `withWhyRN(Component, name?)`

Marks a specific component as tracked and returns the same component (no wrapper). Every re-render of it is logged, avoidable or not. Works with or without `<WhyRN>` - without it, re-renders are logged to the console only.

### `useWhyRN(name, props)`

Hook that returns an array of `RenderReason` objects for the current render. Useful for custom debugging UI or logging.

### `useRenderCount(name?)`

Simple hook that returns how many times the component has rendered. Optionally logs to console.

---

## Use with AI coding agents

The package ships an agent skill, [`whyrn-debug`](skills/whyrn-debug/SKILL.md). It teaches Claude Code, Codex and other [Agent Skills](https://agentskills.io)-compatible tools to measure re-renders instead of guessing: wire up `<WhyRN>`, read the reasons from Metro, apply the fix the log points to (`useMemo`, `useCallback`, `React.memo`, context split, store selector), and measure again.

Expose it once from your app root and commit the links:

```bash
mkdir -p .claude/skills .agents/skills
ln -s ../../node_modules/whyrn.dev/skills/whyrn-debug .claude/skills/whyrn-debug
ln -s ../../node_modules/whyrn.dev/skills/whyrn-debug .agents/skills/whyrn-debug
```

Then ask - the agent picks the skill up from a plain request, or invoke it explicitly:

```
/whyrn-debug The product list stutters while scrolling. Find out why and fix it.   # Claude Code
$whyrn-debug The product list stutters while scrolling. Find out why and fix it.   # Codex
```

The skill includes a log summarizer that ranks components by re-render count and groups their reasons:

```bash
node node_modules/whyrn.dev/skills/whyrn-debug/scripts/summarize-log.mjs metro.log
```

```
779 re-renders across 11 components

  302  Button  (rendered by Screen)
          2× prop "onPress": new function every render - useCallback in Screen, then React.memo(Button)
  132  FlexChild  (rendered by Screen)
          4× props are equal - wrap FlexChild in React.memo
   66  ThemeLabel  (rendered by Screen)
          2× ThemeContext got a new value with the same content - useMemo the Provider value
```

A plain-text overview for LLMs lives at [whyrn.dev/llms.txt](https://whyrn.dev/llms.txt).

---

## Comparison

| | React DevTools | why-did-you-render | **WhyRN** |
|---|---|---|---|
| Highlights renders on screen | ✅ "Highlight updates" | ❌ | ✅ |
| Says why | ⚠️ Profiler: "props changed: x" | ✅ Console | ✅ Console + badge |
| Same content vs real change | ❌ | ✅ | ✅ |
| Only renders worth fixing | ❌ every render | ⚠️ opt-in per component | ✅ avoidable + costly, by default |
| Says where to fix it | ❌ | ❌ | ✅ parent + hook to use |
| Needs a DevTools window / profiling session | ✅ needed | ❌ | ❌ |
| Setup | built in | init + Babel config | one wrapper |
| Agent skill | ❌ | ❌ | ✅ |

---

## How It Works

1. `<WhyRN>` subscribes to React's commit notifications through `__REACT_DEVTOOLS_GLOBAL_HOOK__` (the same channel React DevTools uses; React Native dev builds always provide it)
2. On every commit it walks only the parts of the fiber tree that did work, and compares each re-rendered component with its previous version: props, `useState`/`useReducer` values, context values and external stores
3. The host views each component rendered are measured with `measureInWindow`
4. A render is **avoidable** when no prop changed by value (only new functions or objects with the same content), no state changed except to an equal value, and no context or store pushed new content. By default only those that waste at least `criticalMs` of render time per second (from React's `actualDuration`) are reported; children of a reported component are folded in as consequences
5. A global overlay flashes a border with a reason badge - or, in heatmap mode, keeps a box per component instance colored by its render rate in a 5-second window

Nothing in your tree is replaced or wrapped: no patched `createElement`, no patched hooks, no extra views. Layout, component identity (`child.type === Screen` checks in navigators) and hook order stay exactly as they are.

**Production safety:** every entry point (`<WhyRN>`, `withWhyRN`, `useWhyRN`, `useRenderCount`) checks `__DEV__` at the top. In release builds the entire library is inert - no subscriptions, no overlays, no timers, no allocations.

---

## Example app

[`example/`](example) is an Expo app wired to `src/` (changes hot-reload):

```bash
cd example && bun install && bunx expo start --ios
```

---

## Requirements

- React 18+
- React Native 0.70+
- Hermes or JSC

---

## Roadmap

- [x] Only avoidable re-renders, with the parent to fix and the fix (0.3)
- [x] Re-render count on the overlay (heatmap `×N`, 0.3)
- [ ] Context name without `displayName` - resolve it from the Provider in the tree
- [ ] State variable names instead of `state[0]` (optional Babel plugin)
- [ ] FlatList / FlashList hints (`renderItem`, `keyExtractor`, `extraData`)
- [ ] React Compiler awareness - skip hints it already handles
- [ ] React Native DevTools panel
- [ ] Per-component render timeline
- [ ] Expo Snack playground

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

---

## License

[MIT](LICENSE)

---

<p align="center">
  If WhyRN helps you debug faster, consider giving it a ⭐
  <br />
  <a href="https://github.com/vladbars/whyrn">github.com/vladbars/whyrn</a>
</p>
