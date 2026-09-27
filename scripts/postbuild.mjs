/**
 * Post-build patch for the CommonJS bundles.
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

/** CommonJS bundles that need `module.exports` to be the logger. */
const CJS_BUNDLES = ['dist/index.js', 'dist/index.browser.js'];
/** ESM bundles that only need the duplicated sourcemap pragma cleaned up. */
const ESM_BUNDLES = ['dist/index.mjs', 'dist/index.browser.mjs'];

const REASSIGN =
    "\n// fan-logger: `require('fan-logger')` is the logger itself, with the named\n" +
    '// exports (colors, createLogger, setLevel, ...) attached onto it.\n' +
    'module.exports = Object.assign(exports.default, exports);\n';

function fail(message) {
    console.error('✖ postbuild: ' + message);
    process.exit(1);
}

/** tsup 8.5 emits the sourcemap pragma twice; keep the last one only. */
function dedupeSourcemapPragma(code) {
    let seen = false;
    return code
        .split('\n')
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

for (const file of CJS_BUNDLES) {
    if (!existsSync(file)) fail(file + ' is missing - did tsup run?');

    let code = readFileSync(file, 'utf8');

    if (!/^exports\.default = \w+;$/m.test(code)) {
        fail(
            'expected an `exports.default = <var>;` line in ' + file + '. ' +
            'The bundler output shape changed - review scripts/postbuild.mjs.'
        );
    }
    if (code.includes('module.exports = Object.assign')) {
        fail(file + ': the reassignment is already present - postbuild ran twice?');
    }

    code = dedupeSourcemapPragma(code);

    // Insert before the sourcemap pragma so the pragma stays last.
    const pragma = code.match(/\n\/\/# sourceMappingURL=.*$/);
    code = pragma
        ? code.slice(0, pragma.index) + '\n' + REASSIGN + pragma[0].trimStart() + '\n'
        : code + REASSIGN;

    writeFileSync(file, code);
    console.log('✓ postbuild: module.exports reassigned in ' + file);
}

for (const file of ESM_BUNDLES) {
    if (!existsSync(file)) fail(file + ' is missing - did tsup run?');
    const before = readFileSync(file, 'utf8');
    const after = dedupeSourcemapPragma(before);
    if (after !== before) {
        writeFileSync(file, after);
        console.log('✓ postbuild: deduped sourcemap pragma in ' + file);
    }
}
