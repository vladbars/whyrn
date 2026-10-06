#!/usr/bin/env node
// Summarize WhyRN re-render logs from Metro: components ranked by re-render
// count, each with its reasons grouped. Reads a file argument or stdin.
//
//   node summarize-log.mjs metro.log
//   npx expo start 2>&1 | tee metro.log      # then run the line above
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
const HEADER = /🔁\s+(.+?) re-rendered \(#\d+\)/;
// Metro prefixes console output with " LOG " / " INFO " etc.
const PREFIX = /^\s*(LOG|INFO|WARN|DEBUG)\s+/;

const components = new Map();
let current = null;

for (let line of raw.replace(ANSI, '').split(/\r?\n/)) {
  line = line.replace(PREFIX, '');
  const header = line.match(HEADER);

  if (header) {
    const name = header[1].trim();
    current = components.get(name) ?? { name, renders: 0, reasons: new Map() };
    current.renders++;
    components.set(name, current);
    continue;
  }

  // Reason lines are indented by two spaces directly under a header.
  if (current && /^\s{2}\S/.test(line)) {
    const reason = normalize(line.trim());
    current.reasons.set(reason, (current.reasons.get(reason) ?? 0) + 1);
    continue;
  }

  if (line.trim() !== '') current = null;
}

// Keep the reason category, drop the concrete values so identical causes group.
function normalize(reason) {
  return reason
    .replace(/(changed(?: \([^)]*\))?):.*$/, '$1')
    .replace(/^(state\[\d+\] changed).*$/, '$1');
}

if (components.size === 0) {
  console.log('No WhyRN re-render lines found. Is <WhyRN> mounted and logToConsole enabled?');
  process.exit(1);
}

const ranked = [...components.values()].sort((a, b) => b.renders - a.renders);
const total = ranked.reduce((sum, c) => sum + c.renders, 0);

console.log(`${total} re-renders across ${ranked.length} components\n`);

for (const c of ranked.slice(0, top)) {
  console.log(`${String(c.renders).padStart(5)}  ${c.name}`);
  const reasons = [...c.reasons.entries()].sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of reasons) {
    console.log(`       ${String(count).padStart(4)}× ${reason}`);
  }
}

if (ranked.length > top) {
  console.log(`\n… ${ranked.length - top} more (use --top N)`);
}
