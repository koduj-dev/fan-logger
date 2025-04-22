import { Chalk } from "chalk";

type LogFunction = (...args: any[]) => void;
type ColorFunction = (text: string) => Chalk;

interface Logger {
    info: LogFunction;
    warn: LogFunction;
    error: LogFunction;
    success: LogFunction;
    debug: LogFunction;
    fatal: LogFunction;
    section: (name?: string, width?: number, color?: ColorFunction) => void;
    separator: (width?: number, color?: ColorFunction) => void;

    /**
     * Generic logger function – provide custom label & color.
     * @example log.log('CUSTOM', chalk.blue, 'Something happened');
     */
    log: (label: string, color: ColorFunction, ...args: any[]) => void;

    /**
     * Creates a scoped logger instance with prefix.
     * @example log.scope('Media')
     */
    scope: (namespace: string) => Logger;

    /**
     * Alias for `scope`. Inspired by loggers like `winston`, `pino`, etc.
     */
    child: (namespace: string) => Logger;
}

declare const logger: Logger;
export = logger;
