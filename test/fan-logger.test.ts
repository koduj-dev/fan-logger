import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import log, {
    colors,
    combine,
    configure,
    createLogger,
    getLevel,
    reset,
    setLevel,
    stripAnsi,
    type Level,
} from '../src/index';

/** Captures stdout (console.log) and stderr (console.error) separately. */
function capture() {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lines = (spy: typeof out) => spy.mock.calls.map((c) => stripAnsi(String(c[0])));
    return {
        out: () => lines(out),
        err: () => lines(err),
        all: () => [...lines(out), ...lines(err)],
        outText: () => lines(out).join('\n'),
        errText: () => lines(err).join('\n'),
    };
}

const ENV_KEYS = ['DEBUG', 'FAN_LOG_LEVEL', 'FAN_LOG_TIMESTAMP', 'NO_COLOR', 'FORCE_COLOR', 'TERM'];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
    reset();
    savedEnv = {};
    for (const key of ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
    }
});

afterEach(() => {
    vi.restoreAllMocks();
    reset();
    for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
    }
});

/* ------------------------------------------------- documented API (README) */

describe('log levels', () => {
    it.each([
        ['info', '[INFO]'],
        ['warn', '[WARN]'],
        ['error', '[ERR]'],
        ['success', '[OK]'],
        ['fatal', '[FATAL]'],
    ] as const)('%s() prints %s', (method, tag) => {
        const io = capture();
        log[method]('message');
        expect(io.all().join('\n')).toContain(tag);
    });

    it('prefixes every line with a timestamp', () => {
        const io = capture();
        log.info('hi');
        expect(io.out()[0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}] \[INFO] hi$/);
    });

    it('formats objects the way console.log does', () => {
        const io = capture();
        log.info({ foo: 'bar', baz: 42 });
        const line = io.out()[0]!;
        expect(line).toContain('foo');
        expect(line).toContain('bar');
        expect(line).toContain('42');
    });

    it('supports printf-style format strings', () => {
        const io = capture();
        log.info('%s scored %d', 'Filip', 42);
        expect(io.out()[0]).toContain('Filip scored 42');
    });
});

describe('debug()', () => {
    it('is hidden by default', () => {
        const io = capture();
        log.debug('hidden');
        expect(io.all()).toHaveLength(0);
    });

    it.each(['true', '1'])('is shown with DEBUG=%s', (value) => {
        process.env.DEBUG = value;
        const io = capture();
        log.debug('visible');
        expect(io.outText()).toContain('[DEBUG]');
    });

    it('stays hidden for other DEBUG values, as documented', () => {
        process.env.DEBUG = 'myapp:*';
        const io = capture();
        log.debug('hidden');
        expect(io.all()).toHaveLength(0);
    });

    it('is shown when the level is explicitly debug, without DEBUG', () => {
        setLevel('debug');
        const io = capture();
        log.debug('visible');
        expect(io.outText()).toContain('[DEBUG]');
    });

    it('stays quiet at a raised level even when DEBUG=true', () => {
        process.env.DEBUG = 'true';
        setLevel('warn');
        const io = capture();
        log.debug('hidden');
        expect(io.all()).toHaveLength(0);
    });
});

describe('scope() / child()', () => {
    it('prefixes the namespace', () => {
        const io = capture();
        log.scope('API').info('GET /');
        expect(io.out()[0]).toContain('[API] [INFO]');
    });

    it('treats child() as an alias', () => {
        const io = capture();
        log.child('Player').success('Started');
        expect(io.out()[0]).toContain('[Player] [OK]');
    });

    it('concatenates nested namespaces with a colon', () => {
        const io = capture();
        log.child('Core').child('Auth').child('Token').child('Refresh').success('renewed');
        expect(io.out()[0]).toContain('[Core:Auth:Token:Refresh]');
    });

    it('mixes scope() and child() freely', () => {
        const io = capture();
        log.scope('Video').child('Decoder').warn('Low buffer');
        expect(io.out()[0]).toContain('[Video:Decoder] [WARN]');
    });

    it('does not mutate the parent logger', () => {
        const io = capture();
        const api = log.scope('API');
        api.info('scoped');
        log.info('root');
        expect(io.out()[1]).not.toContain('[API]');
    });

    it('exposes the namespace', () => {
        expect(log.namespace).toBe('');
        expect(log.scope('A').child('B').namespace).toBe('A:B');
    });
});

describe('log(label, color, ...args)', () => {
    it('prints a custom label', () => {
        const io = capture();
        log.log('BUILD', colors.blueBright, 'Compiling files...');
        expect(io.out()[0]).toContain('[BUILD] Compiling files...');
    });

    it('accepts any (text: string) => string, e.g. an identity function', () => {
        const io = capture();
        log.log('CUSTOM', (t) => t, 'plain');
        expect(io.out()[0]).toContain('[CUSTOM] plain');
    });

    it('does not crash when the colour argument is omitted', () => {
        const io = capture();
        // @ts-expect-error - deliberately calling it the wrong way
        log.log('DATA', { id: 1 });
        expect(io.out()[0]).toContain('[DATA]');
        expect(io.out()[0]).toContain('id');
    });
});

describe('section() / separator()', () => {
    it('centres the upper-cased title', () => {
        const io = capture();
        log.section('build phase', 50);
        expect(io.out()[0]).toHaveLength(50);
        expect(io.out()[0]).toContain('[ BUILD PHASE ]');
    });

    it('prints a plain line without a title', () => {
        const io = capture();
        log.section('', 40);
        expect(io.out()[0]).toBe('='.repeat(40));
    });

    it('defaults to 80 columns', () => {
        const io = capture();
        log.section();
        log.separator();
        expect(io.out()[0]).toHaveLength(80);
        expect(io.out()[1]).toHaveLength(80);
    });

    it('widens past the requested width rather than truncating the title', () => {
        const io = capture();
        log.section('a very long section title indeed', 10);
        expect(io.out()[0]).toContain('[ A VERY LONG SECTION TITLE INDEED ]');
    });

    it('survives a zero or negative width', () => {
        const io = capture();
        log.separator(0);
        log.separator(-5);
        expect(io.out()).toEqual(['', '']);
    });

    it('respects a custom colour', () => {
        configure({ color: true });
        const io = capture();
        log.separator(10, colors.red);
        expect(vi.mocked(console.log).mock.calls[0]![0]).toContain('\u001B[31m');
    });
});

/* ------------------------------------------------------- stream separation */

describe('stream routing', () => {
    it('sends info, success, warn and debug to stdout', () => {
        setLevel('debug');
        const io = capture();
        log.info('a');
        log.success('b');
        log.warn('c');
        log.debug('d');
        expect(io.out()).toHaveLength(4);
        expect(io.err()).toHaveLength(0);
    });

    it('sends error and fatal to stderr', () => {
        const io = capture();
        log.error('boom');
        log.fatal('worse');
        expect(io.out()).toHaveLength(0);
        expect(io.err()).toHaveLength(2);
        expect(io.errText()).toContain('[ERR] boom');
        expect(io.errText()).toContain('[FATAL] worse');
    });
});

/* ------------------------------------------------------------------ levels */

describe('levels', () => {
    it('defaults to info', () => {
        expect(getLevel()).toBe('info');
    });

    it.each([
        ['silent', []],
        ['fatal', ['[FATAL]']],
        ['error', ['[ERR]', '[FATAL]']],
        ['warn', ['[WARN]', '[ERR]', '[FATAL]']],
        ['info', ['[INFO]', '[OK]', '[WARN]', '[ERR]', '[FATAL]']],
        ['debug', ['[DEBUG]', '[INFO]', '[OK]', '[WARN]', '[ERR]', '[FATAL]']],
    ] as const)('level %s prints exactly %j', (level, expectedTags) => {
        setLevel(level as Level);
        const io = capture();
        log.debug('d');
        log.info('i');
        log.success('s');
        log.warn('w');
        log.error('e');
        log.fatal('f');
        const text = io.all().join('\n');
        for (const tag of expectedTags) expect(text).toContain(tag);
        expect(io.all()).toHaveLength(expectedTags.length);
    });

    it('reads FAN_LOG_LEVEL from the environment', () => {
        process.env.FAN_LOG_LEVEL = 'error';
        expect(getLevel()).toBe('error');
        const io = capture();
        log.info('hidden');
        log.error('shown');
        expect(io.out()).toHaveLength(0);
        expect(io.err()).toHaveLength(1);
    });

    it('lets an explicit setLevel() win over the environment', () => {
        process.env.FAN_LOG_LEVEL = 'silent';
        setLevel('info');
        const io = capture();
        log.info('shown');
        expect(io.out()).toHaveLength(1);
    });

    it('ignores a bogus FAN_LOG_LEVEL', () => {
        process.env.FAN_LOG_LEVEL = 'chatty';
        expect(getLevel()).toBe('info');
    });

    it('throws on a bogus setLevel()', () => {
        // @ts-expect-error - deliberately invalid
        expect(() => setLevel('chatty')).toThrow(/unknown level/);
    });

    it('can be set through configure()', () => {
        configure({ level: 'warn' });
        expect(getLevel()).toBe('warn');
        const io = capture();
        log.info('hidden');
        log.warn('shown');
        expect(io.out()).toHaveLength(1);
    });

    it('falls back to the environment when configure({ level: undefined })', () => {
        configure({ level: 'silent' });
        expect(getLevel()).toBe('silent');
        process.env.FAN_LOG_LEVEL = 'warn';
        configure({ level: undefined });
        expect(getLevel()).toBe('warn');
    });

    it('silences section, separator and processInfo too', () => {
        setLevel('silent');
        const io = capture();
        log.section('build');
        log.separator();
        log.processInfo();
        expect(io.all()).toHaveLength(0);
    });
});

/* -------------------------------------------------------------- timestamps */

describe('timestamps', () => {
    it('uses local time by default, not UTC', () => {
        const io = capture();
        log.info('x');
        const now = new Date();
        const expected = String(now.getHours()).padStart(2, '0') + ':';
        expect(io.out()[0]).toContain('[' + expected);
    });

    it('can render UTC', () => {
        configure({ timestamp: 'utc' });
        const io = capture();
        log.info('x');
        const expected = String(new Date().getUTCHours()).padStart(2, '0') + ':';
        expect(io.out()[0]).toContain('[' + expected);
    });

    it('can render a full ISO stamp', () => {
        configure({ timestamp: 'iso' });
        const io = capture();
        log.info('x');
        expect(io.out()[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z]/);
    });

    it('can be turned off entirely', () => {
        configure({ timestamp: 'none' });
        const io = capture();
        log.info('x');
        expect(io.out()[0]).toBe('[INFO] x');
    });

    it('accepts a custom formatter', () => {
        configure({ timestamp: () => 'T-0' });
        const io = capture();
        log.info('x');
        expect(io.out()[0]).toBe('[T-0] [INFO] x');
    });

    it('reads FAN_LOG_TIMESTAMP from the environment', () => {
        process.env.FAN_LOG_TIMESTAMP = 'none';
        const io = capture();
        log.info('x');
        expect(io.out()[0]).toBe('[INFO] x');
    });
});

/* ------------------------------------------------------------------ colour */

describe('colour handling', () => {
    it('strips ANSI when the stream is not a TTY', () => {
        configure({ color: false });
        const io = capture();
        log.info('x');
        expect(vi.mocked(console.log).mock.calls[0]![0]).not.toContain('\u001B[');
        expect(io.out()[0]).toContain('[INFO] x');
    });

    it('emits ANSI when colour is forced on', () => {
        configure({ color: true });
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        log.info('x');
        const line = String(spy.mock.calls[0]![0]);
        expect(line).toContain('\u001B[36m');
        expect(stripAnsi(line)).toMatch(/\[INFO] x$/);
    });

    it('honours NO_COLOR', () => {
        process.env.FORCE_COLOR = '1';
        process.env.NO_COLOR = '1';
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        log.info('x');
        expect(String(spy.mock.calls[0]![0])).not.toContain('\u001B[');
    });

    it('honours FORCE_COLOR', () => {
        process.env.FORCE_COLOR = '1';
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        log.info('x');
        expect(String(spy.mock.calls[0]![0])).toContain('\u001B[36m');
    });

    it('treats FORCE_COLOR=0 as off', () => {
        process.env.FORCE_COLOR = '0';
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        log.info('x');
        expect(String(spy.mock.calls[0]![0])).not.toContain('\u001B[');
    });

    it('exposes composable styles', () => {
        expect(colors.red('x')).toBe('\u001B[31mx\u001B[39m');
        expect(stripAnsi(colors.red('x'))).toBe('x');
        const style = combine(colors.bgRed, colors.white, colors.bold);
        expect(stripAnsi(style('boom'))).toBe('boom');
        expect(style('boom')).toContain('\u001B[41m');
        expect(style('boom')).toContain('\u001B[1m');
    });
});

/* ------------------------------------------------------------- processInfo */

describe('processInfo()', () => {
    const FIELDS = [
        /CPU model/, /CPU cores/, /Total RAM/, /Free RAM/,
        /Node heap limit/, /Node version/, /V8 version/, /Raw exec args/,
    ];

    it('prints every diagnostic field under a default header', () => {
        const io = capture();
        log.processInfo();
        const text = io.outText();
        expect(text).toMatch(/\[ PROCESS INFO ]/);
        for (const field of FIELDS) expect(text).toMatch(field);
    });

    it('accepts a custom title', () => {
        const io = capture();
        log.processInfo('Build Host');
        expect(io.outText()).toMatch(/\[ BUILD HOST ]/);
    });

    it('does not crash when os.cpus() reports nothing', async () => {
        // Real behaviour on some containers and VMs - this used to throw
        // "Cannot read properties of undefined (reading 'model')".
        const os = await import('os');
        const spy = vi.spyOn(os.default, 'cpus').mockReturnValue([]);
        const io = capture();
        expect(() => log.processInfo()).not.toThrow();
        expect(io.outText()).toContain('CPU model: unknown');
        expect(io.outText()).toContain('CPU cores (logical): unknown');
        spy.mockRestore();
    });
});

/* ----------------------------------------------------------- createLogger */

describe('createLogger()', () => {
    it('creates an independent namespaced logger', () => {
        const io = capture();
        createLogger('Worker').info('started');
        expect(io.out()[0]).toContain('[Worker] [INFO]');
    });

    it('creates a root logger when given no namespace', () => {
        const io = capture();
        createLogger().info('plain');
        expect(io.out()[0]).not.toContain('[] ');
    });
});
