/**
 * Post-build patch for the CommonJS bundle.
 *
 * tsup/rollup emits `exports.default = logger` plus named exports. That would
 * make `require('fan-logger')` a module namespace object, breaking the 0.2.x
 * contract where the export *is* the logger. Rollup's own `footer` option is
 * injected before its export block, so the reassignment has to be appended
 * here instead.
 *
 * Preconditions are asserted rather than assumed: if a future tsup changes the
 * output shape, the build fails loudly instead of silently shipping a package
 * whose `require()` returns the wrong thing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CJS = 'dist/index.js';
const ESM = 'dist/index.mjs';

const REASSIGN =
    '\n// fan-logger: `require(\'fan-logger\')` is the logger itself, with the named\n' +
    '// exports (colors, createLogger, setLevel, ...) attached onto it.\n' +
    'module.exports = Object.assign(exports.default, exports);\n';

function fail(message) {
    console.error('✖ postbuild: ' + message);
    process.exit(1);
}

if (!existsSync(CJS)) fail(CJS + ' is missing - did tsup run?');

let cjs = readFileSync(CJS, 'utf8');

if (!/^exports\.default = \w+;$/m.test(cjs)) {
    fail(
        'expected an `exports.default = <var>;` line in ' + CJS + '. ' +
        'The bundler output shape changed - review scripts/postbuild.mjs.'
    );
}
if (cjs.includes('module.exports = Object.assign')) {
    fail('the reassignment is already present - postbuild ran twice?');
}

/** tsup 8.5 emits the sourcemap pragma twice; keep the last one only. */
function dedupeSourcemapPragma(code) {
    const lines = code.split('\n');
    let seen = false;
    return lines
        .reverse()
        .filter((line) => {
            if (!line.startsWith('//# sourceMappingURL=')) return true;
            if (seen) return false;
            seen = true;
            return true;
        })
        .reverse()
        .join('\n');
}

cjs = dedupeSourcemapPragma(cjs);

// Insert before the sourcemap pragma so the pragma stays last.
const pragma = cjs.match(/\n\/\/# sourceMappingURL=.*$/);
cjs = pragma
    ? cjs.slice(0, pragma.index) + '\n' + REASSIGN + pragma[0].trimStart() + '\n'
    : cjs + REASSIGN;

writeFileSync(CJS, cjs);
console.log('✓ postbuild: module.exports reassigned in ' + CJS);

if (existsSync(ESM)) {
    const before = readFileSync(ESM, 'utf8');
    const after = dedupeSourcemapPragma(before);
    if (after !== before) {
        writeFileSync(ESM, after);
        console.log('✓ postbuild: deduped sourcemap pragma in ' + ESM);
    }
}
