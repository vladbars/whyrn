# AGENTS.md

Guidance for coding agents working **on** this repository. To *use* WhyRN in an
app, see the `whyrn-debug` skill in [`skills/whyrn-debug/`](skills/whyrn-debug/SKILL.md).

## What this is

`whyrn` (npm) shows why React Native components re-render. It subscribes to
React commits via `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot`, diffs each
re-rendered fiber against its `alternate` (props, hook state, context, external
stores), measures host views with `measureInWindow`, and draws an overlay.

## Invariants — do not break these

- **Never replace or wrap user components.** No patching of `createElement`,
  `jsx`/`jsxDEV` or hooks, no wrapper `View`s. Earlier versions did that and it
  broke hook order, remounted subtrees, collapsed `flex` layouts and broke
  `child.type === Screen` checks in navigators.
- **Every entry point is inert when `__DEV__` is false** (`IS_DEV` in
  `src/constants.ts`).
- **No dynamic `require(variable)`** — Metro cannot bundle it.
- Stay compatible with React 18 and 19, Paper and Fabric. Only rely on fiber
  fields React DevTools relies on (see `src/core/fiber.ts`).
- The overlay subtree is registered in `internalComponents` and never inspected,
  otherwise overlay updates would report themselves forever.
- Zero runtime dependencies; `react` and `react-native` are peers.

## Layout

```
src/core/commitTracker.ts  commit hook, fiber walk, reason computation
src/core/fiber.ts          fiber shapes, host lookup, measurement (Fabric/Paper/web)
src/core/differ.ts         props diff, reason building
src/core/tracker.ts        render counts, heat window, console logging
src/overlay/               flash boxes and badges
src/components/            <WhyRN>, withWhyRN
src/hooks/                 useWhyRN, useRenderCount
skills/whyrn-debug/        agent skill shipped in the npm package
example/                   Expo app wired to ../src for manual testing
```

## Commands

Use **bun**.

```bash
bun install
bun run typecheck      # tsc --noEmit
bun run build          # bob build → lib/
npm pack --dry-run     # check published files (src, lib, skills)
```

Manual test on a simulator (resolves `whyrn` from `../src`, hot-reloads):

```bash
cd example && bun install && bunx expo start --ios
```

`SELF_TEST` in `example/App.tsx` drives state updates on timers so the overlay
can be checked without tapping. Keep it `false` when committing.

There is no unit test suite yet; verify behaviour in the example app and keep
`typecheck` and `build` green.

## Releasing

Bump `version` in `package.json`, push to `main`, then push a matching
`vX.Y.Z` tag. `.github/workflows/release.yml` verifies the tag, builds and
publishes to npm via trusted publishing (OIDC). Only release when asked.

## Commits

Commit as the repository owner; do not add `Co-Authored-By` trailers.
