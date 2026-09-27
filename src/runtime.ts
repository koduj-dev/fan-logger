/**
 * Node runtime adapter.
 *
 * Everything that touches Node built-ins lives here, so the browser build can
 * swap this one module out (see src/runtime.browser.ts) instead of dragging
 * `util`, `os` and `v8` into a bundle that has no such thing.
 *
 * Bare specifiers are deliberate: Node 10 cannot resolve the `node:` prefix.
 */
import util from 'util';
import os from 'os';
import v8 from 'v8';

import { stripAnsi } from './colors';

export type Target = 'out' | 'err';

/** Which console method to use. Node only distinguishes stdout from stderr. */
export type Channel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogRecord {
    target: Target;
    channel: Channel;
    /** Timestamp, namespace and tag, already coloured (or not). */
    prefix: string;
    args: unknown[];
    /** False when ANSI must be removed before writing. */
    color: boolean;
}

/** True when this target renders ANSI without being told to. */
export function autoColor(target: Target): boolean {
    if (typeof process === 'undefined') return false;
    const stream = target === 'err' ? process.stderr : process.stdout;
    return Boolean(stream && stream.isTTY);
}

export function emit(record: LogRecord): void {
    const line = record.prefix + util.format(...record.args);
    const text = record.color ? line : stripAnsi(line);
    if (record.target === 'err') console.error(text);
    else console.log(text);
}

/** Diagnostic lines for processInfo(), or null if the host cannot report them. */
export function diagnostics(): string[] | null {
    // os.cpus() legitimately returns [] on some containers and VMs.
    const cpus = typeof os.cpus === 'function' ? os.cpus() || [] : [];
    const cpu = cpus[0];

    let heap = 'unknown';
    try {
        heap = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024) + ' MB';
    } catch {
        /* not every runtime exposes v8 heap statistics */
    }

    const gb = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';

    return [
        cpu
            ? '\u{1F5A5}️  CPU model: ' + cpu.model + ' @ ' + cpu.speed + 'MHz'
            : '\u{1F5A5}️  CPU model: unknown (os.cpus() reported none)',
        '\u{1F9F5} CPU cores (logical): ' + (cpus.length || 'unknown'),
        '\u{1F9E0} Total RAM: ' + gb(os.totalmem()),
        '\u{1F4BE} Free RAM: ' + gb(os.freemem()),
        '\u{1F3C3} Node heap limit: ' + heap,
        '\u{1F522} Node version: ' + process.version,
        '\u{1F4E6} V8 version: ' + process.versions.v8,
        '\u{1F4CE} Raw exec args: ' + JSON.stringify(process.execArgv),
    ];
}
