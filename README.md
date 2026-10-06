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

> Components flash on re-render. A badge tells you *why*. No more guessing.

---

## Why?

Ever stared at your React Native app and asked:

- *"Why is this re-rendering?"*
- *"Why is my FlatList so laggy?"*
- *"Which prop is causing this?"*

React Native doesn't tell you. The Profiler gives you timing, not reasons. Console logs don't show you *where*.

**WhyRN does.**

It highlights re-renders **on screen**, shows the **exact reason** — which prop changed, which state updated, whether it's a new reference or a real value change — and paints a **heatmap** so you can spot the hottest components instantly.

---

## Features

- 🔁 **Highlights re-renders in real time** — components flash with a colored border
- 🧠 **Shows exact reason** — props, state, hooks, or parent re-render
- 🔍 **Props diff** — distinguishes reference change vs value change
- 🌡️ **Heatmap mode** — cold (blue) to hot (red) based on render frequency
- ⚡ **Zero config** — wrap your app, done
- 📱 **React Native first** — built for mobile, not a web port
- 🪶 **Zero dependencies** — only React and React Native as peers
- 🔇 **Dev only** — hard `__DEV__` guard at every entry point; zero overhead in release builds

---

## Install

Install as a **dev dependency** — whyrn is a debug tool and has no place in production bundles:

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

Every component that re-renders will flash on screen with a badge showing the reason.

---

## Example Output

When a component re-renders, you see this in the console:

```
🔁 UserCard re-rendered (#4)
  prop "user" changed (new reference, same value)
  state[0] changed: 1 → 2
```

And on screen — every re-rendered component flashes, and the badge says why:

<p align="center">
  <img src="https://raw.githubusercontent.com/vladbars/whyrn/main/assets/screenshot.png" alt="Overlay with reason badges: Counter state[0]: 14 → 15, UserCard props: user" width="360" />
</p>

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

See which components render the most — cold (blue) means few renders, hot (red) means many:

```tsx
<WhyRN heatmap>
  <YourApp />
</WhyRN>
```

The border color shifts based on render frequency in a 5-second sliding window.

---

## Configuration

All options are passed as props. Every prop is optional. React Native internals (`View`, `Text`, `Pressable`, `Animated*`, `RCT*`, …) are always skipped.

```tsx
<WhyRN
  enabled={__DEV__}              // Kill switch (default: __DEV__)
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

Root provider. Wraps your app to enable visual overlays and auto-tracking.

### `withWhyRN(Component, name?)`

Marks a specific component as tracked and returns the same component (no wrapper). Works with or without `<WhyRN>` — without it, re-renders are logged to the console only.

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

Then ask — the agent picks the skill up from a plain request, or invoke it explicitly:

```
/whyrn-debug The product list stutters while scrolling. Find out why and fix it.   # Claude Code
$whyrn-debug The product list stutters while scrolling. Find out why and fix it.   # Codex
```

The skill includes a log summarizer that ranks components by re-render count and groups their reasons:

```bash
node node_modules/whyrn.dev/skills/whyrn-debug/scripts/summarize-log.mjs metro.log
```

```
1093 re-renders across 7 components

  413  Button
        235× prop "onPress" changed (new function reference)
        178× Parent re-rendered
   89  UserCard
         89× prop "user" changed (new reference, same value)
```

A plain-text overview for LLMs lives at [whyrn.dev/llms.txt](https://whyrn.dev/llms.txt).

---

## Comparison

| Feature | why-did-you-render | React DevTools | **WhyRN** |
|---|---|---|---|
| React Native support | ⚠️ Partial | ✅ | ✅ |
| Visual overlay | ❌ | ⚠️ Border only | ✅ Flash + badge |
| Shows *why* | ⚠️ Console only | ❌ | ✅ On screen |
| Props diff | ✅ | ❌ | ✅ |
| Reference vs value | ⚠️ | ❌ | ✅ |
| Heatmap | ❌ | ❌ | ✅ |
| Zero config | ❌ Needs init + babel | ❌ | ✅ |
| Hook tracking | ✅ | ❌ | ✅ |

---

## How It Works

1. `<WhyRN>` subscribes to React's commit notifications through `__REACT_DEVTOOLS_GLOBAL_HOOK__` (the same channel React DevTools uses; React Native dev builds always provide it)
2. On every commit it walks only the parts of the fiber tree that did work, and compares each re-rendered component with its previous version: props, `useState`/`useReducer` values, context values and external stores
3. The host views each component rendered are measured with `measureInWindow`
4. A global overlay renders an `Animated.View` border that fades out, plus a reason badge
5. In heatmap mode, the border color is computed from the render rate in a sliding window

Nothing in your tree is replaced or wrapped: no patched `createElement`, no patched hooks, no extra views. Layout, component identity (`child.type === Screen` checks in navigators) and hook order stay exactly as they are.

**Production safety:** every entry point (`<WhyRN>`, `withWhyRN`, `useWhyRN`, `useRenderCount`) checks `__DEV__` at the top. In release builds the entire library is inert — no subscriptions, no overlays, no timers, no allocations.

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

- [ ] Expo Snack playground
- [ ] State variable name extraction (babel plugin)
- [ ] Flipper / DevTools integration
- [ ] Per-component render timeline
- [ ] Re-render count badge overlay
- [ ] Context tracking with provider name

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
