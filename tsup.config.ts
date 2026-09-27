import path from 'node:path';
import { defineConfig, type Options } from 'tsup';

/**
 * Three bundles from one source:
 *
 *   dist/index.js           CommonJS, ES2018 -> reached via `main`, which is all
 *                                               Node 10 understands (it ignores
 *                                               `exports` entirely).
 *   dist/index.mjs          ESM              -> reached via `exports.import` by
 *                                               modern Node and bundlers.
 *   dist/index.browser.*    CJS + ESM        -> reached via the `browser`
 *                                               condition; plain console logs,
 *                                               no Node built-ins.
 *
 * `clean` is handled by the `clean` npm script instead of tsup, so the second
 * config cannot wipe the first one's output.
 */

/**
 * Redirects `./runtime` to `./runtime.browser` for the browser bundle. That one
 * module is the only place Node built-ins are touched, so swapping it is enough
 * to keep `util`, `os` and `v8` out of a browser bundle.
 */
const browserRuntime: NonNullable<Options['esbuildPlugins']>[number] = {
    name: 'fan-logger-browser-runtime',
    setup(build) {
        build.onResolve({ filter: /^\.\/runtime$/ }, () => ({
            path: path.resolve('src', 'runtime.browser.ts'),
        }));
    },
};

const shared: Options = {
    format: ['cjs', 'esm'],
    // Node 10 has no optional chaining, no nullish coalescing and no `node:`
    // specifier. es2018 is the newest target it can actually run;
    // `npm run check:es2018` parses the output to prove we stayed inside it.
    target: 'es2018',
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.js' : '.mjs' }),
    sourcemap: true,
    treeshake: true,
    splitting: false,
    clean: false,
};

export default defineConfig([
    {
        ...shared,
        entry: { index: 'src/index.ts' },
        platform: 'node',
        dts: true,
    },
    {
        ...shared,
        entry: { 'index.browser': 'src/index.ts' },
        platform: 'browser',
        // The public types are identical - only the implementation differs - so
        // the browser condition points at the same declarations.
        dts: false,
        esbuildPlugins: [browserRuntime],
    },
]);
