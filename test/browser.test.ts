/**
 * Exercises the logger against the browser runtime adapter, which is what the
 * `browser` export condition resolves to. Expectation: plain console logs, no
 * ANSI, and values handed to the console untouched so devtools can render them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Swap ./runtime for ./runtime.browser, exactly as the browser build does.
vi.mock('../src/runtime', async () => await import('../src/runtime.browser'));

import log, { colors, configure, reset, setLevel, stripAnsi } from '../src/index';
import { autoColor, diagnostics } from '../src/runtime.browser';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type Method = (typeof CONSOLE_METHODS)[number];

let calls: Array<{ method: Method; args: unknown[] }>;

beforeEach(() => {
    reset();
    calls = [];
    for (const method of CONSOLE_METHODS) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
            calls.push({ method, args });
        });
    }
});

afterEach(() => {
    vi.restoreAllMocks();
    reset();
});

const only = () => {
    expect(calls).toHaveLength(1);
    return calls[0]!;
};

describe('browser runtime: console routing', () => {
    it.each([
        ['info', 'info'],
        ['success', 'log'],
        ['warn', 'warn'],
        ['error', 'error'],
        ['fatal', 'error'],
    ] as const)('%s() goes to console.%s', (method, expected) => {
        log[method]('message');
        expect(only().method).toBe(expected);
    });

    it('debug() goes to console.debug', () => {
        setLevel('debug');
        log.debug('message');
        expect(only().method).toBe('debug');
    });

    it('sends section() and separator() to console.log', () => {
        log.section('build', 20);
        log.separator(10);
        expect(calls.map((c) => c.method)).toEqual(['log', 'log']);
        expect(calls[1]!.args).toEqual(['='.repeat(10)]);
    });
});

describe('browser runtime: formatting', () => {
    it('emits no ANSI by default, even with FORCE_COLOR set', () => {
        process.env.FORCE_COLOR = '1';
        try {
            // FORCE_COLOR is honoured, but a console cannot render ANSI, so the
            // default (auto) path must not colour.
            configure({ color: 'auto' });
            expect(autoColor('out')).toBe(false);
        } finally {
            delete process.env.FORCE_COLOR;
        }
        log.info('x');
        expect(String(only().args[0])).not.toContain('\u001B[');
    });

    it('still colours when colour is explicitly forced through configure()', () => {
        configure({ color: true });
        log.info('x');
        expect(String(only().args[0])).toContain('\u001B[');
    });

    it('passes objects through untouched so devtools can expand them', () => {
        const payload = { nested: { a: 1 } };
        log.info(payload);
        const { args } = only();
        expect(args[0]).toMatch(/\[INFO]$/);
        expect(args[1]).toBe(payload); // same reference, not stringified
    });

    it('does not leave a double space before the message', () => {
        log.info('message');
        expect(String(only().args[0])).toMatch(/\[INFO]$/);
        expect(only().args[1]).toBe('message');
    });

    it('merges the prefix into the format string so %s keeps working', () => {
        log.info('printf %s and %d', 'str', 42);
        const { args } = only();
        expect(String(args[0])).toMatch(/\[INFO] printf %s and %d$/);
        expect(args.slice(1)).toEqual(['str', 42]);
    });

    it('prints a bare prefix with no trailing space when there are no args', () => {
        log.info();
        expect(only().args).toEqual([expect.stringMatching(/\[INFO]$/)]);
    });

    it('keeps the custom label and namespace', () => {
        log.scope('API').child('Auth').log('BUILD', colors.blueBright, 'compiling');
        const { args } = only();
        expect(stripAnsi(String(args[0]))).toContain('[API:Auth] [BUILD]');
    });
});

describe('browser runtime: processInfo()', () => {
    it('reports what the host can tell it', () => {
        log.processInfo('Browser host');
        const text = calls.map((c) => c.args.map(String).join(' ')).join('\n');
        expect(text).toContain('[ BROWSER HOST ]');
        expect(text).toMatch(/Logical cores|not available/);
    });

    it('returns null diagnostics when there is no navigator', () => {
        const original = globalThis.navigator;
        // @ts-expect-error - simulating a bare runtime (edge worker, jsdom-less)
        delete globalThis.navigator;
        try {
            expect(diagnostics()).toBeNull();
        } finally {
            if (original !== undefined) {
                Object.defineProperty(globalThis, 'navigator', {
                    value: original,
                    configurable: true,
                    writable: true,
                });
            }
        }
    });

    it('says so when diagnostics are unavailable', () => {
        const original = globalThis.navigator;
        // @ts-expect-error - simulating a bare runtime
        delete globalThis.navigator;
        try {
            log.processInfo();
            const text = calls.map((c) => c.args.map(String).join(' ')).join('\n');
            expect(text).toContain('not available on this platform');
        } finally {
            if (original !== undefined) {
                Object.defineProperty(globalThis, 'navigator', {
                    value: original,
                    configurable: true,
                    writable: true,
                });
            }
        }
    });
});
