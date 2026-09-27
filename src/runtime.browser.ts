/**
 * Browser / edge runtime adapter.
 *
 * fan-logger is a terminal logger first, so in a browser it does the most
 * sensible thing: plain console logs. ANSI escapes are dropped (devtools would
 * show them as garbage) and arguments are handed to the console untouched, so
 * objects stay expandable in devtools instead of being flattened to a string.
 *
 * Selected through the `browser` export condition; no Node built-ins here.
 */
import { stripAnsi } from './colors';

export type Target = 'out' | 'err';
export type Channel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogRecord {
    target: Target;
    channel: Channel;
    prefix: string;
    args: unknown[];
    color: boolean;
}

/** Consoles do not render ANSI, so never colour by default. */
export function autoColor(_target: Target): boolean {
    return false;
}

function trimEnd(text: string): string {
    return text.replace(/\s+$/, '');
}

/** Matches the format specifiers the console itself understands. */
const FORMAT_SPECIFIER = /%[sdifjoOc%]/;

function pick(channel: Channel): (...args: unknown[]) => void {
    const c = console as unknown as Record<string, ((...args: unknown[]) => void) | undefined>;
    const fn = c[channel] || c.log;
    return (...args: unknown[]) => {
        (fn as (...a: unknown[]) => void).apply(console, args);
    };
}

export function emit(record: LogRecord): void {
    const head = record.color ? record.prefix : stripAnsi(record.prefix);
    const write = pick(record.channel);

    if (record.args.length === 0) {
        write(trimEnd(head));
        return;
    }

    const [first, ...rest] = record.args;

    // Keep printf-style formatting working: the console only honours
    // specifiers in its first argument, so the prefix has to be merged in.
    // The prefix keeps its trailing space here because nothing else adds one.
    if (typeof first === 'string' && FORMAT_SPECIFIER.test(first)) {
        write(head + first, ...rest);
        return;
    }

    // Otherwise pass the values through, so devtools can render them natively.
    // The console joins arguments with a space, so drop the prefix's own.
    write(trimEnd(head), ...record.args);
}

export function diagnostics(): string[] | null {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    if (!nav) return null;

    const lines: string[] = [];
    const cores = (nav as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency;
    const memory = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
    const heap = (performance as Performance & { memory?: { jsHeapSizeLimit?: number } }).memory;

    lines.push('\u{1F9F5} Logical cores: ' + (cores || 'unknown'));
    if (memory) lines.push('\u{1F9E0} Device memory: ' + memory + ' GB');
    if (heap && heap.jsHeapSizeLimit) {
        lines.push('\u{1F3C3} JS heap limit: ' + Math.round(heap.jsHeapSizeLimit / 1024 / 1024) + ' MB');
    }
    lines.push('\u{1F310} User agent: ' + nav.userAgent);
    if (typeof location !== 'undefined') lines.push('\u{1F4CE} Location: ' + location.href);

    return lines;
}
