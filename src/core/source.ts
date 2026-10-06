// Source locations for reported components, via the Metro dev server - the same
// endpoints LogBox uses: /symbolicate turns a bundle stack into original files,
// /open-stack-frame opens a file in the editor (REACT_EDITOR / your IDE).
//
// The location is the JSX that rendered the component, i.e. the line in the
// parent where the unstable prop is created - exactly where the fix goes.

import { NativeModules } from 'react-native';
import type { EditorOption } from '../types';

export interface SourceLocation {
  file: string;
  lineNumber: number;
  column?: number;
}

/** What we can capture synchronously at commit time. */
export interface SourceHint {
  /** React 19: Error.stack captured when the element was created (dev only). */
  stack?: string;
  /** React 18: @babel/plugin-transform-react-jsx-source location. */
  location?: SourceLocation;
  /**
   * Used when the JSX site is library code (e.g. a screen rendered by
   * react-navigation): the component's own first child, created inside its
   * render, points into the component's file.
   */
  fallback?: SourceHint;
}

interface StackFrame {
  methodName: string;
  file: string;
  lineNumber: number;
  column: number;
}

export function getSourceHint(fiber: unknown): SourceHint | undefined {
  const own = getElementHint(fiber);
  const child = (fiber as { child?: unknown } | null)?.child;
  const fallback = child ? getElementHint(child) : undefined;
  if (!own) return fallback;
  return fallback ? { ...own, fallback } : own;
}

function getElementHint(fiber: unknown): SourceHint | undefined {
  const f = fiber as {
    _debugStack?: { stack?: string } | null;
    _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number } | null;
  };
  const src = f._debugSource;
  if (src?.fileName && src.lineNumber) {
    return { location: { file: src.fileName, lineNumber: src.lineNumber, column: src.columnNumber } };
  }
  const stack = f._debugStack?.stack;
  return typeof stack === 'string' ? { stack } : undefined;
}

let devServer: string | null | undefined;

function getDevServer(): string | null {
  if (devServer !== undefined) return devServer;
  try {
    const sourceCode = NativeModules.SourceCode as
      | { scriptURL?: string; getConstants?: () => { scriptURL?: string } }
      | undefined;
    const url = sourceCode?.getConstants?.().scriptURL ?? sourceCode?.scriptURL;
    const match = typeof url === 'string' ? url.match(/^(https?:\/\/[^/]+)/) : null;
    devServer = match ? match[1] : null;
  } catch {
    devServer = null;
  }
  return devServer;
}

// "at Name (http://host:8081/index.bundle?…:12:34)" or "at http://…:12:34"
const FRAME = /^\s*at (?:(.+?) \()?(https?:\/\/.+?):(\d+):(\d+)\)?\s*$/;

function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    const m = line.match(FRAME);
    if (m) {
      frames.push({ methodName: m[1] ?? '<anonymous>', file: m[2], lineNumber: Number(m[3]), column: Number(m[4]) });
    }
    if (frames.length >= 12) break;
  }
  return frames;
}

function isUserFrame(file: string): boolean {
  return !/[/\\]node_modules[/\\]/.test(file) && !/[/\\]whyrn[^/\\]*[/\\]src[/\\]/.test(file);
}

const cache = new Map<string, Promise<SourceLocation | undefined>>();

/** Resolve a hint to an original file location. Never throws; undefined when unknown. */
export function resolveSource(hint: SourceHint | undefined): Promise<SourceLocation | undefined> {
  if (!hint) return Promise.resolve(undefined);
  if (hint.fallback) {
    const { fallback, ...own } = hint;
    return resolveSource(own).then((location) => location ?? resolveSource(fallback));
  }
  if (hint.location) return Promise.resolve(hint.location);
  if (!hint.stack) return Promise.resolve(undefined);

  const cached = cache.get(hint.stack);
  if (cached) return cached;

  const server = getDevServer();
  const frames = parseStack(hint.stack);
  if (!server || frames.length === 0) return Promise.resolve(undefined);

  const promise = fetch(`${server}/symbolicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stack: frames }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { stack?: StackFrame[] } | null) => {
      const frame = json?.stack?.find((f) => f.file && isUserFrame(f.file));
      return frame ? { file: frame.file, lineNumber: frame.lineNumber, column: frame.column } : undefined;
    })
    .catch(() => undefined);

  cache.set(hint.stack, promise);
  return promise;
}

/** Open a location in the editor configured for Metro (REACT_EDITOR, or the detected IDE). */
export function openInEditor(location: SourceLocation): void {
  const server = getDevServer();
  if (!server) return;
  fetch(`${server}/open-stack-frame`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: location.file, lineNumber: location.lineNumber }),
  }).catch(() => {});
}

function editorUrl(editor: EditorOption, location: SourceLocation): string | undefined {
  if (typeof editor === 'function') return editor(location);
  const { file, lineNumber, column } = location;
  const path = file.startsWith('/') ? file : `/${file.replace(/\\/g, '/')}`;
  const position = `${lineNumber}${column !== undefined ? `:${column}` : ''}`;
  switch (editor) {
    case 'vscode':
    case 'cursor':
    case 'windsurf':
      // The trailing query keeps DevTools from treating ":line:col" as its own
      // position and dropping it; the editor ignores the query.
      return `${editor}://file${encodeURI(path)}:${position}?whyrn`;
    case 'zed':
      return `zed://file${encodeURI(path)}:${position}`;
    case 'webstorm':
    case 'idea':
      return `${editor}://open?file=${encodeURIComponent(file)}&line=${lineNumber}`;
    default:
      return undefined;
  }
}

/**
 * A clickable location for the console. The React Native DevTools console
 * links any `scheme://` URL, so an editor URL (`vscode://file/…:12:3`) opens the
 * file directly; the browser asks once to allow the editor. `editor: 'none'`
 * prints a plain `file:line:col`, which terminals link instead.
 */
export function formatLocation(location: SourceLocation, editor: EditorOption = 'vscode'): string {
  return (
    editorUrl(editor, location) ??
    `${location.file}:${location.lineNumber}${location.column !== undefined ? `:${location.column}` : ''}`
  );
}
