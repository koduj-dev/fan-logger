/**
 * fan-logger - simple, pretty terminal logger with timestamps, colors, scopes,
 * and zero fluff.
 *
 * Zero runtime dependencies. Ships a CommonJS build (Node 10+) and an ESM build
 * (modern Node, bundlers, TypeScript).
 *
 * Note on imports: bare specifiers are deliberate. Node 10 does not understand
 * the `node:` prefix, and the CommonJS build has to keep working there.
 */
import util from 'util';
import os from 'os';
import v8 from 'v8';

import { colors, stripAnsi, combine, type ColorFn } from './colors';

export { colors, combine, stripAnsi };
export type { ColorFn };

/** Legacy alias - the published 0.2.x `index.d.ts` called this ColorFunction. */
export type ColorFunction = ColorFn;

export type Level = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug';

/** How the leading `[hh:mm:ss.mmm]` stamp is rendered. */
export type TimestampMode = 'local' | 'utc' | 'iso' | 'none';

export interface Options {
    /** Minimum severity that gets printed. Default `'info'`. */
    level?: Level;
    /** Timestamp style, or a function returning the stamp. Default `'local'`. */
    timestamp?: TimestampMode | (() => string);
    /** `true`/`false` force colour on/off; `'auto'` (default) detects per stream. */
    color?: boolean | 'auto';
}

const LEVEL_WEIGHT: Record<Level, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
    silent: 100,
};

const DEBUG_WEIGHT = LEVEL_WEIGHT.debug;
const INFO_WEIGHT = LEVEL_WEIGHT.info;

function isLevel(value: unknown): value is Level {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEVEL_WEIGHT, value);
}

/* ------------------------------------------------------------------ config */

interface ResolvedConfig {
    level: Level | null;
    timestamp: TimestampMode | (() => string) | null;
    color: boolean | 'auto' | null;
}

/** Explicit configure()/setLevel() calls. `null` means "fall back to env". */
const config: ResolvedConfig = { level: null, timestamp: null, color: null };

function env(name: string): string | undefined {
    // `process` may be absent in non-Node runtimes; stay defensive.
    if (typeof process === 'undefined' || !process.env) return undefined;
    const value = process.env[name];
    return value === undefined || value === '' ? undefined : value;
}

function isDebugEnabled(): boolean {
    const debug = env('DEBUG');
    return debug === 'true' || debug === '1';
}

function currentLevel(): Level {
    if (config.level) return config.level;
    const fromEnv = (env('FAN_LOG_LEVEL') || '').toLowerCase();
    if (isLevel(fromEnv)) return fromEnv;
    return 'info';
}

function currentWeight(): number {
    return LEVEL_WEIGHT[currentLevel()];
}

function timestampMode(): TimestampMode | (() => string) {
    if (config.timestamp) return config.timestamp;
    const fromEnv = (env('FAN_LOG_TIMESTAMP') || '').toLowerCase();
    if (fromEnv === 'local' || fromEnv === 'utc' || fromEnv === 'iso' || fromEnv === 'none') {
        return fromEnv;
    }
    return 'local';
}

/* --------------------------------------------------------------- timestamp */

function pad(value: number, width: number): string {
    let out = String(value);
    while (out.length < width) out = '0' + out;
    return out;
}

/**
 * Formatted by hand on purpose: Node 10 ships small-icu, so
 * `toLocaleTimeString('cs-CZ')` silently falls back to the `en` locale
 * and would print "1:00:00 AM" instead of "13:00:00".
 */
function formatTimestamp(): string {
    const mode = timestampMode();
    if (typeof mode === 'function') return mode();
    if (mode === 'none') return '';

    const now = new Date();
    if (mode === 'iso') return now.toISOString();
    if (mode === 'utc') {
        return (
            pad(now.getUTCHours(), 2) +
            ':' +
            pad(now.getUTCMinutes(), 2) +
            ':' +
            pad(now.getUTCSeconds(), 2) +
            '.' +
            pad(now.getUTCMilliseconds(), 3)
        );
    }
    return (
        pad(now.getHours(), 2) +
        ':' +
        pad(now.getMinutes(), 2) +
        ':' +
        pad(now.getSeconds(), 2) +
        '.' +
        pad(now.getMilliseconds(), 3)
    );
}

/* ------------------------------------------------------------------ output */

type Target = 'out' | 'err';

function supportsColor(target: Target): boolean {
    if (config.color === true) return true;
    if (config.color === false) return false;

    if (env('NO_COLOR') !== undefined) return false;
    const force = env('FORCE_COLOR');
    if (force !== undefined) return force !== '0' && force !== 'false';
    if (env('TERM') === 'dumb') return false;

    if (typeof process === 'undefined') return false;
    const stream = target === 'err' ? process.stderr : process.stdout;
    return Boolean(stream && stream.isTTY);
}

function write(target: Target, line: string): void {
    const text = supportsColor(target) ? line : stripAnsi(line);
    if (target === 'err') {
        console.error(text);
    } else {
        console.log(text);
    }
}

/* ------------------------------------------------------------------ logger */

export interface Logger {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    success: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    fatal: (...args: unknown[]) => void;

    /**
     * Generic logger - provide a custom label and colour.
     * @example log.log('BUILD', chalk.blueBright, 'Compiling files...');
     */
    log: (label: string, color: ColorFn, ...args: unknown[]) => void;

    /** Creates a scoped logger whose namespace is prefixed to every line. */
    scope: (namespace: string) => Logger;
    /** Alias for `scope`, mirroring `winston` / `pino`. */
    child: (namespace: string) => Logger;

    section: (name?: string, width?: number, color?: ColorFn) => void;
    separator: (width?: number, color?: ColorFn) => void;

    /** Prints CPU, memory, heap, Node/V8 version and exec args. */
    processInfo: (title?: string) => void;

    /** The namespace this logger prefixes, `''` for the root logger. */
    readonly namespace: string;
}

interface Spec {
    label: string;
    color: ColorFn;
    weight: number;
    target: Target;
}

const SPECS = {
    info: { label: 'INFO', color: colors.cyan, weight: LEVEL_WEIGHT.info, target: 'out' },
    success: { label: 'OK', color: colors.green, weight: LEVEL_WEIGHT.info, target: 'out' },
    warn: { label: 'WARN', color: colors.yellow, weight: LEVEL_WEIGHT.warn, target: 'out' },
    error: { label: 'ERR', color: colors.red, weight: LEVEL_WEIGHT.error, target: 'err' },
    fatal: {
        label: 'FATAL',
        color: combine(colors.bgRed, colors.white, colors.bold),
        weight: LEVEL_WEIGHT.fatal,
        target: 'err',
    },
    debug: { label: 'DEBUG', color: colors.gray, weight: LEVEL_WEIGHT.debug, target: 'out' },
} satisfies Record<string, Spec>;

export function createLogger(namespace = ''): Logger {
    function emit(spec: Spec, args: unknown[]): void {
        const stamp = formatTimestamp();
        const prefix = stamp ? colors.dim('[' + stamp + ']') + ' ' : '';
        const ns = namespace ? '[' + namespace + '] ' : '';
        const tag = spec.color('[' + spec.label + ']');
        write(spec.target, prefix + ns + tag + ' ' + util.format(...args));
    }

    function logWith(label: string, color: ColorFn, ...args: unknown[]): void {
        if (currentWeight() > INFO_WEIGHT) return;
        // Defensive: a missing colour argument used to crash with
        // "color is not a function"; treat it as part of the message instead.
        if (typeof color !== 'function') {
            const rest = color === undefined ? args : [color, ...args];
            emit({ label: String(label), color: (t) => t, weight: INFO_WEIGHT, target: 'out' }, rest);
            return;
        }
        emit({ label: String(label), color, weight: INFO_WEIGHT, target: 'out' }, args);
    }

    function leveled(spec: Spec) {
        return (...args: unknown[]): void => {
            if (currentWeight() > spec.weight) return;
            emit(spec, args);
        };
    }

    function debug(...args: unknown[]): void {
        const weight = currentWeight();
        // `DEBUG=true` keeps working as documented, but an explicit level
        // above info still wins - quieting a tool must stay quiet.
        const allowed = weight <= DEBUG_WEIGHT || (isDebugEnabled() && weight <= INFO_WEIGHT);
        if (!allowed) return;
        emit(SPECS.debug, args);
    }

    function printSection(name = '', width = 80, color: ColorFn = colors.magenta): void {
        if (currentWeight() > INFO_WEIGHT) return;
        const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width as number)) : 80;
        const paint = typeof color === 'function' ? color : (t: string) => t;

        if (name && String(name).length > 0) {
            const title = ' [ ' + String(name).toUpperCase() + ' ] ';
            const total = Math.max(safeWidth, title.length + 4);
            const remaining = total - title.length;
            const left = Math.floor(remaining / 2);
            write('out', paint('='.repeat(left) + title + '='.repeat(remaining - left)));
        } else {
            write('out', paint('='.repeat(safeWidth)));
        }
    }

    function processInfo(title = 'Process Info'): void {
        if (currentWeight() > INFO_WEIGHT) return;

        const info = leveled(SPECS.info);
        printSection(title);

        // os.cpus() legitimately returns [] on some containers and VMs.
        const cpus = typeof os.cpus === 'function' ? os.cpus() || [] : [];
        const cpu = cpus[0];
        info(
            cpu
                ? '\u{1F5A5}️  CPU model: ' + cpu.model + ' @ ' + cpu.speed + 'MHz'
                : '\u{1F5A5}️  CPU model: unknown (os.cpus() reported none)'
        );
        info('\u{1F9F5} CPU cores (logical): ' + (cpus.length || 'unknown'));
        info('\u{1F9E0} Total RAM: ' + (os.totalmem() / 1024 / 1024 / 1024).toFixed(1) + ' GB');
        info('\u{1F4BE} Free RAM: ' + (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + ' GB');

        let heap = 'unknown';
        try {
            heap = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024) + ' MB';
        } catch {
            /* not every runtime exposes v8 heap statistics */
        }
        info('\u{1F3C3} Node heap limit: ' + heap);

        info('\u{1F522} Node version: ' + process.version);
        info('\u{1F4E6} V8 version: ' + process.versions.v8);
        info('\u{1F4CE} Raw exec args: ' + JSON.stringify(process.execArgv));
        printSection();
    }

    const nest = (child: string): Logger =>
        createLogger(namespace ? namespace + ':' + child : child);

    return {
        log: logWith,
        info: leveled(SPECS.info),
        warn: leveled(SPECS.warn),
        error: leveled(SPECS.error),
        success: leveled(SPECS.success),
        fatal: leveled(SPECS.fatal),
        debug,
        section: printSection,
        separator: (width = 80, color: ColorFn = colors.gray) => printSection('', width, color),
        scope: nest,
        child: nest,
        processInfo,
        namespace,
    };
}

/* ------------------------------------------------------------ public config */

/** Sets the minimum severity that gets printed. `'silent'` mutes everything. */
export function setLevel(level: Level): void {
    if (!isLevel(level)) {
        throw new TypeError(
            'fan-logger: unknown level ' + JSON.stringify(level) +
            '. Expected one of: ' + Object.keys(LEVEL_WEIGHT).join(', ')
        );
    }
    config.level = level;
}

export function getLevel(): Level {
    return currentLevel();
}

/** Applies options; pass `undefined` for a key to restore env/auto behaviour. */
export function configure(options: Options = {}): void {
    if ('level' in options) {
        if (options.level === undefined) config.level = null;
        else setLevel(options.level);
    }
    if ('timestamp' in options) {
        config.timestamp = options.timestamp === undefined ? null : options.timestamp;
    }
    if ('color' in options) {
        config.color = options.color === undefined ? null : options.color;
    }
}

/** Restores the default configuration. Mainly useful in tests. */
export function reset(): void {
    config.level = null;
    config.timestamp = null;
    config.color = null;
}

/* ---------------------------------------------------------- default export */

const root = createLogger();

export const log = root.log;
export const info = root.info;
export const warn = root.warn;
export const error = root.error;
export const success = root.success;
export const fatal = root.fatal;
export const debug = root.debug;
export const section = root.section;
export const separator = root.separator;
export const scope = root.scope;
export const child = root.child;
export const processInfo = root.processInfo;

export default root;
