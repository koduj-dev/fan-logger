/**
 * Installs the real packed tarball into throwaway projects and proves the
 * package is actually consumable. These are the exact failures that made
 * fan-logger 0.2.0 unusable outside its home project:
 *
 *   - `import { info } from 'fan-logger'`  -> SyntaxError: Named export not found
 *   - `log.log('BUILD', chalk.blue, 'x')`  -> TS2345 with chalk 4 AND chalk 5
 *   - CommonJS `require()` on Node 10      -> must keep working
 *
 * Set FAN_NODE10 to a Node 10 binary to include the Node 10 leg.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = process.cwd();
const work = mkdtempSync(join(tmpdir(), 'fan-logger-consumers-'));
const results = [];
let failed = false;

function step(name, fn) {
    try {
        fn();
        results.push(['✓', name, '']);
    } catch (err) {
        failed = true;
        const detail = (err.stdout ? String(err.stdout) : '') + (err.stderr ? String(err.stderr) : '');
        results.push(['✖', name, (detail || err.message).trim().split('\n').slice(0, 6).join('\n    ')]);
    }
}

function run(cmd, args, cwd) {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function project(name, pkg, deps) {
    const dir = join(work, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', private: true, ...pkg }, null, 2));
    run('npm', ['install', '--silent', '--no-audit', '--no-fund', ...deps], dir);
    return dir;
}

console.log('Packing tarball...');
execSync('npm pack --silent --pack-destination ' + JSON.stringify(work), { cwd: repo, stdio: 'inherit' });
const tarball = resolve(work, readdirSync(work).find((f) => f.endsWith('.tgz')));
console.log('Tarball: ' + tarball + '\n');

/* ------------------------------------------------------- CommonJS consumer */

const cjsDir = project('cjs-consumer', {}, [tarball]);
writeFileSync(join(cjsDir, 'app.cjs'), `
const assert = require('assert');
const log = require('fan-logger');

// The 0.2.x usage pattern must survive unchanged.
assert.strictEqual(typeof log.info, 'function', 'log.info missing');
assert.strictEqual(typeof log.log, 'function', 'log.log missing');
assert.strictEqual(typeof log.scope, 'function', 'log.scope missing');
assert.strictEqual(typeof log.child, 'function', 'log.child missing');
assert.strictEqual(typeof log.section, 'function', 'log.section missing');
assert.strictEqual(typeof log.separator, 'function', 'log.separator missing');
assert.strictEqual(typeof log.processInfo, 'function', 'log.processInfo missing');
assert.strictEqual(typeof log.setLevel, 'function', 'log.setLevel missing');
assert.strictEqual(typeof log.colors, 'object', 'log.colors missing');

log.info('cjs ok');
assert.strictEqual(log.scope('A').child('B').namespace, 'A:B');
log.processInfo('cjs');
console.log('CJS OK');
`);
step('CommonJS: require() exposes the full documented API', () => run(process.execPath, ['app.cjs'], cjsDir));

/* ------------------------------------------------------------ ESM consumer */

const esmDir = project('esm-consumer', { type: 'module' }, [tarball]);
writeFileSync(join(esmDir, 'default.mjs'), `
import assert from 'node:assert';
import log from 'fan-logger';
assert.strictEqual(typeof log.info, 'function');
log.info('esm default ok');
console.log('ESM default OK');
`);
writeFileSync(join(esmDir, 'named.mjs'), `
import assert from 'node:assert';
import { info, scope, colors, setLevel, createLogger, configure } from 'fan-logger';
assert.strictEqual(typeof info, 'function');
assert.strictEqual(typeof scope, 'function');
assert.strictEqual(typeof colors.cyan, 'function');
assert.strictEqual(typeof setLevel, 'function');
assert.strictEqual(typeof createLogger, 'function');
assert.strictEqual(typeof configure, 'function');
info('esm named ok');
console.log('ESM named OK');
`);
step('ESM: default import', () => run(process.execPath, ['default.mjs'], esmDir));
step('ESM: named imports (regression - failed in 0.2.0)', () => run(process.execPath, ['named.mjs'], esmDir));

/* ----------------------------------------------- TypeScript, modern resolution */

for (const chalkSpec of ['chalk@4', 'chalk@5']) {
    const tag = chalkSpec.replace('@', ' ');
    const tsDir = project('ts-consumer-' + chalkSpec.replace(/[^a-z0-9]/gi, ''), { type: 'module' }, [
        tarball, 'typescript@5', '@types/node@22', chalkSpec,
    ]);
    writeFileSync(join(tsDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
            module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022',
            strict: true, verbatimModuleSyntax: true, noEmit: true,
            skipLibCheck: true, types: ['node'],
        },
        files: ['app.ts'],
    }, null, 2));
    writeFileSync(join(tsDir, 'app.ts'), `
import log, { colors, createLogger, setLevel, type ColorFn } from 'fan-logger';
import chalk from 'chalk';

log.info('typed');
// The README's own example - this is what failed to typecheck in 0.2.0.
log.log('BUILD', chalk.blueBright, 'Compiling files...');
log.log('CUSTOM', chalk.bgMagenta.white.bold, 'Styled output');
log.section('release', 60, chalk.cyan);
log.separator(40, colors.gray);

const api = log.scope('API').child('Auth');
api.warn('slow');

setLevel('warn');
const own: ColorFn = colors.combine(colors.bgRed, colors.white);
createLogger('X').fatal(own('boom'));
`);
    step(`TypeScript (nodenext + verbatimModuleSyntax) with ${tag}`, () => run('npx', ['tsc'], tsDir));
}

/* --------------------------------------------------- browser bundling leg */

const browserDir = project('browser-consumer', { type: 'module' }, [tarball, 'esbuild@0.27']);
writeFileSync(join(browserDir, 'entry.mjs'), `
import log, { colors } from 'fan-logger';
log.info('browser');
log.log('BUILD', colors.blueBright, 'bundled');
`);
step('Bundler: platform=browser resolves the browser build (failed in 0.2.0)', () => {
    run('npx', ['esbuild', 'entry.mjs', '--bundle', '--platform=browser',
                '--format=esm', '--outfile=bundle.js'], browserDir);

    const bundle = readFileSync(join(browserDir, 'bundle.js'), 'utf8');
    for (const builtin of ['util', 'os', 'v8']) {
        const pattern = new RegExp(`require\\(["']${builtin}["']\\)|from ?["']${builtin}["']`);
        if (pattern.test(bundle)) throw new Error(`browser bundle still references "${builtin}"`);
    }
    // The browser build must not carry Node's process diagnostics either.
    if (bundle.includes('getHeapStatistics')) throw new Error('browser bundle carries v8 heap code');
});

/* -------------------------------------------------------------- Node 10 leg */

const node10 = process.env.FAN_NODE10;
if (node10) {
    step('Node 10: requires and runs the CommonJS build', () => {
        const out = run(node10, ['app.cjs'], cjsDir);
        if (!out.includes('CJS OK')) throw new Error('unexpected output: ' + out);
    });
} else {
    results.push(['-', 'Node 10 leg skipped (set FAN_NODE10 to a Node 10 binary)', '']);
}

/* ----------------------------------------------------------------- report */

console.log('\nConsumer matrix:');
for (const [mark, name, detail] of results) {
    console.log(`  ${mark} ${name}`);
    if (detail) console.log('    ' + detail);
}

rmSync(work, { recursive: true, force: true });

if (failed) {
    console.error('\nConsumer checks FAILED.');
    process.exit(1);
}
console.log('\nAll consumer checks passed.');
