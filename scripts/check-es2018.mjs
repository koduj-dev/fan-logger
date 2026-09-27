/**
 * Guards the Node 10 promise, and keeps the browser bundle free of Node.
 *
 * The CommonJS bundle is what Node 10 loads via `main`, so it must contain
 * nothing newer than ES2018, must not use `node:` prefixed builtins, and must
 * not touch globals Node 10 lacks. A parser is the only honest check - grepping
 * for `?.` misses plenty, and "it built fine" proves nothing about Node 10.
 */
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'acorn';

const CHECKS = [
    { file: 'dist/index.js', sourceType: 'script', label: 'CommonJS bundle (Node 10 entry)', node10: true },
    { file: 'dist/index.mjs', sourceType: 'module', label: 'ESM bundle', node10: true },
    { file: 'dist/index.browser.js', sourceType: 'script', label: 'Browser bundle (CJS)', node10: false },
    { file: 'dist/index.browser.mjs', sourceType: 'module', label: 'Browser bundle (ESM)', node10: false },
];

/** Syntax and globals Node 10 does not have. */
const NODE10_FORBIDDEN = [
    { re: /require\(\s*['"]node:/g, why: "`node:` prefixed require - Node 10 cannot resolve it" },
    { re: /from\s*['"]node:/g, why: "`node:` prefixed import - Node 10 cannot resolve it" },
    { re: /\bglobalThis\b/g, why: '`globalThis` is undefined on Node 10' },
    { re: /\bObject\.fromEntries\b/g, why: '`Object.fromEntries` does not exist on Node 10' },
    { re: /\.flatMap\(/g, why: '`Array.prototype.flatMap` does not exist on Node 10' },
    { re: /toLocaleTimeString|toLocaleDateString/g, why: 'Node 10 ships small-icu; locale formatting silently falls back to `en`' },
];

/** Node built-ins must never reach the browser bundle. */
const BROWSER_FORBIDDEN = [
    { re: /require\(\s*['"](util|os|v8|fs|path|module)['"]\s*\)/g, why: 'Node built-in required in the browser bundle' },
    { re: /from\s*['"](util|os|v8|fs|path|module)['"]/g, why: 'Node built-in imported in the browser bundle' },
];

let failed = false;

for (const { file, sourceType, label, node10 } of CHECKS) {
    if (!existsSync(file)) {
        console.error(`✖ ${file} is missing - run \`npm run build\` first`);
        failed = true;
        continue;
    }

    const code = readFileSync(file, 'utf8');

    try {
        parse(code, { ecmaVersion: 2018, sourceType });
        console.log(`✓ ${label.padEnd(34)} parses as ES2018 (${file})`);
    } catch (err) {
        const line = err.loc ? ` at line ${err.loc.line}:${err.loc.column}` : '';
        console.error(`✖ ${label} contains syntax newer than ES2018${line}: ${err.message}`);
        failed = true;
    }

    for (const { re, why } of node10 ? NODE10_FORBIDDEN : BROWSER_FORBIDDEN) {
        const hits = code.match(re);
        if (hits) {
            console.error(`✖ ${file}: found ${hits.length}x ${hits[0]} - ${why}`);
            failed = true;
        }
    }
}

if (failed) {
    console.error('\nCompatibility gate FAILED.');
    process.exit(1);
}
console.log('\nCompatibility gate passed: Node 10 entry is ES2018-clean, browser bundle is Node-free.');
