import { defineConfig } from 'tsup';

/**
 * Two bundles from one source:
 *
 *   dist/index.js   CommonJS, ES2018  -> reached via `main`, which is all
 *                                        Node 10 understands (it ignores
 *                                        `exports` entirely).
 *   dist/index.mjs  ESM               -> reached via `exports.import` by
 *                                        modern Node, bundlers and TypeScript.
 */
export default defineConfig({
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    // Node 10 has no optional chaining, no nullish coalescing and no `node:`
    // specifier. es2018 is the newest target it can actually run;
    // `npm run check:es2018` parses the output to prove we stayed inside it.
    target: 'es2018',
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.js' : '.mjs' }),
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false
});
