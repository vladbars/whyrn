#!/usr/bin/env node
// Summarize WhyRN output from Metro: components ranked by avoidable re-render
// count, each with its causes. Understands both the default summaries
// (report="avoidable") and per-render lines (report="all"). Reads a file
// argument or stdin.
//
//   node summarize-log.mjs metro.log
//   pbpaste | node summarize-log.mjs --top 10

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
let top = 20;
let file;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--top') top = Number(args[++i]) || top;
  else if (args[i] === '-h' || args[i] === '--help') {
    console.log('usage: summarize-log.mjs [metro.log] [--top N]   (reads stdin without a file)');
    process.exit(0);
  } else file = args[i];
}

const raw = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');

const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]/g;
// Metro prefixes console output with " LOG " / " INFO " etc.
const PREFIX = /^\s*(LOG|INFO|WARN|DEBUG)\s+/;

// report="avoidable"
// "  HeavyList ×2 · 200 instances · 33 ms wasted · rendered by Screen"
const SUMMARY_ITEM = /^ {2}(\S.*?) ×(\d+)((?: · [^·]+)*)$/;
const SUMMARY_CAUSE = /^ {4}(?:(\d+)× )?(.+)$/;
const STILL = /WhyRN: still avoidable — (.+?) \(same causes/;
// report="all"
const RENDER = /🔁\s+(.+?) re-rendered \(#\d+\)/;
const RENDER_REASON = /^ {2}(\S.*)$/;

const components = new Map();

function get(name, owner) {
  const key = `${name}\u0000${owner ?? ''}`;
  let c = components.get(key);
  if (!c) {
    c = { name, owner, renders: 0, ms: 0, causes: new Map() };
    components.set(key, c);
  }
  return c;
}

// Keep the cause category, drop concrete values so identical causes group.
function normalize(reason) {
  return reason
    .replace(/(changed(?: \([^)]*\))?):.*$/, '$1')
    .replace(/^(state\[\d+\] changed).*$/, '$1');
}

let mode = null; // 'summary' | 'render'
let current = null;

for (let line of raw.replace(ANSI, '').split(/\r?\n/)) {
  line = line.replace(PREFIX, '');

  const still = line.match(STILL);
  if (still) {
    for (const part of still[1].split(', ')) {
      const m = part.match(/^(.+) ×(\d+)$/);
      if (!m) continue;
      // Attribute repeats to the component's most common owner seen so far.
      const known = [...components.values()].filter((c) => c.name === m[1]);
      const target = known.sort((a, b) => b.renders - a.renders)[0] ?? get(m[1]);
      target.renders += Number(m[2]);
    }
    mode = null;
    current = null;
    continue;
  }

  if (/WhyRN: \d+ avoidable re-render/.test(line) || /WhyRN: still avoidable \(/.test(line)) {
    mode = 'summary';
    current = null;
    continue;
  }

  const render = line.match(RENDER);
  if (render) {
    mode = 'render';
    current = get(render[1].trim());
    current.renders++;
    continue;
  }

  if (mode === 'summary') {
    const item = line.match(SUMMARY_ITEM);
    if (item) {
      const parts = item[3].split(' · ').map((p) => p.trim()).filter(Boolean);
      const owner = parts.find((p) => p.startsWith('rendered by '))?.slice('rendered by '.length);
      const ms = parts.find((p) => p.endsWith(' ms wasted'));
      current = get(item[1], owner);
      current.renders += Number(item[2]);
      if (ms) current.ms += parseFloat(ms);
      continue;
    }
    // "    at vscode://file/…" is a source link, not a cause.
    if (current && /^ {4}at /.test(line)) continue;
    const cause = current && line.match(SUMMARY_CAUSE);
    if (cause) {
      const n = Number(cause[1] ?? 1);
      current.causes.set(cause[2], (current.causes.get(cause[2]) ?? 0) + n);
      continue;
    }
  }

  if (mode === 'render' && current) {
    const reason = line.match(RENDER_REASON);
    if (reason) {
      const r = normalize(reason[1].trim());
      current.causes.set(r, (current.causes.get(r) ?? 0) + 1);
      continue;
    }
  }

  if (line.trim() !== '') {
    mode = null;
    current = null;
  }
}

if (components.size === 0) {
  console.log('No WhyRN output found. Is <WhyRN> mounted and logToConsole enabled?');
  process.exit(1);
}

// A component whose causes are mostly "only because X re-rendered" is a
// consequence: its time is already inside X's. Root causes first, then wasted
// time (when known), then render count.
function isConsequence(c) {
  let follow = 0;
  let other = 0;
  for (const [cause, n] of c.causes) {
    if (cause.startsWith('only because ')) follow += n;
    else other += n;
  }
  return follow > other;
}

const ranked = [...components.values()].sort(
  (a, b) => Number(isConsequence(a)) - Number(isConsequence(b)) || b.ms - a.ms || b.renders - a.renders
);
const total = ranked.reduce((sum, c) => sum + c.renders, 0);

console.log(`${total} re-renders across ${ranked.length} components\n`);

for (const c of ranked.slice(0, top)) {
  const by = c.owner ? `  (rendered by ${c.owner})` : '';
  const ms = c.ms > 0 ? `  ${Math.round(c.ms)} ms wasted` : '';
  console.log(`${String(c.renders).padStart(5)}  ${c.name}${by}${ms}`);
  const causes = [...c.causes.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cause, count] of causes) {
    console.log(`       ${String(count).padStart(4)}× ${cause}`);
  }
}

if (ranked.length > top) {
  console.log(`\n… ${ranked.length - top} more (use --top N)`);
}
