/**
 * fan-logger - simple, pretty terminal logger with timestamps, colors, scopes,
 * and zero fluff.
 *
 * Zero runtime dependencies. Ships a CommonJS build (Node 10+), an ESM build
 * (modern Node, bundlers, TypeScript) and a browser build that degrades to
 * plain console logs.
 *
 * Everything runtime-specific lives behind ./runtime, which the browser build
 * swaps for ./runtime.browser.
 */
import * as runtime from './runtime';
import type { Channel, Target } from './runtime';
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
    // `process` is absent in browsers; stay defensive.
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

function useColor(target: Target): boolean {
    if (config.color === true) return true;
    if (config.color === false) return false;

    if (env('NO_COLOR') !== undefined) return false;
    const force = env('FORCE_COLOR');
    if (force !== undefined) return force !== '0' && force !== 'false';
    if (env('TERM') === 'dumb') return false;

    return runtime.autoColor(target);
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
            pad(now.getUTCHours(), 2) + ':' + pad(now.getUTCMinutes(), 2) + ':' +
            pad(now.getUTCSeconds(), 2) + '.' + pad(now.getUTCMilliseconds(), 3)
        );
    }
    return (
        pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2) + ':' +
        pad(now.getSeconds(), 2) + '.' + pad(now.getMilliseconds(), 3)
    );
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
    channel: Channel;
}

const SPECS = {
    info: { label: 'INFO', color: colors.cyan, weight: LEVEL_WEIGHT.info, target: 'out', channel: 'info' },
    success: { label: 'OK', color: colors.green, weight: LEVEL_WEIGHT.info, target: 'out', channel: 'log' },
    warn: { label: 'WARN', color: colors.yellow, weight: LEVEL_WEIGHT.warn, target: 'out', channel: 'warn' },
    error: { label: 'ERR', color: colors.red, weight: LEVEL_WEIGHT.error, target: 'err', channel: 'error' },
    fatal: {
        label: 'FATAL',
        color: combine(colors.bgRed, colors.white, colors.bold),
        weight: LEVEL_WEIGHT.fatal,
        target: 'err',
        channel: 'error',
    },
    debug: { label: 'DEBUG', color: colors.gray, weight: LEVEL_WEIGHT.debug, target: 'out', channel: 'debug' },
} satisfies Record<string, Spec>;

export function createLogger(namespace = ''): Logger {
    function emit(spec: Spec, args: unknown[]): void {
        const stamp = formatTimestamp();
        const prefix =
            (stamp ? colors.dim('[' + stamp + ']') + ' ' : '') +
            (namespace ? '[' + namespace + '] ' : '') +
            spec.color('[' + spec.label + ']') + ' ';

        runtime.emit({
            target: spec.target,
            channel: spec.channel,
            prefix,
            args,
            color: useColor(spec.target),
        });
    }

    function raw(line: string): void {
        runtime.emit({
            target: 'out',
            channel: 'log',
            prefix: line,
            args: [],
            color: useColor('out'),
        });
    }

    function logWith(label: string, color: ColorFn, ...args: unknown[]): void {
        if (currentWeight() > INFO_WEIGHT) return;

        const spec: Spec = {
            label: String(label),
            color: typeof color === 'function' ? color : (text) => text,
            weight: INFO_WEIGHT,
            target: 'out',
            channel: 'log',
        };

        // Defensive: a missing colour argument used to crash with
        // "color is not a function"; treat it as part of the message instead.
        if (typeof color !== 'function') {
            emit(spec, color === undefined ? args : [color, ...args]);
            return;
        }
        emit(spec, args);
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
        const safeWidth = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 80;
        const paint = typeof color === 'function' ? color : (text: string) => text;

        if (name && String(name).length > 0) {
            const title = ' [ ' + String(name).toUpperCase() + ' ] ';
            const total = Math.max(safeWidth, title.length + 4);
            const remaining = total - title.length;
            const left = Math.floor(remaining / 2);
            raw(paint('='.repeat(left) + title + '='.repeat(remaining - left)));
        } else {
            raw(paint('='.repeat(safeWidth)));
        }
    }

    function processInfo(title = 'Process Info'): void {
        if (currentWeight() > INFO_WEIGHT) return;

        const info = leveled(SPECS.info);
        printSection(title);

        const lines = runtime.diagnostics();
        if (lines === null) {
            info('ℹ️  Process diagnostics are not available on this platform');
        } else {
            for (const line of lines) info(line);
        }

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

/**
 * The default export: a root logger that also carries the module-level helpers,
 * so `log.setLevel(...)` works identically in CommonJS and ESM.
 */
export interface RootLogger extends Logger {
    configure: typeof configure;
    setLevel: typeof setLevel;
    getLevel: typeof getLevel;
    reset: typeof reset;
    createLogger: typeof createLogger;
    colors: typeof colors;
    combine: typeof combine;
    stripAnsi: typeof stripAnsi;
}

const root: RootLogger = Object.assign(createLogger(), {
    configure,
    setLevel,
    getLevel,
    reset,
    createLogger,
    colors,
    combine,
    stripAnsi,
});

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
