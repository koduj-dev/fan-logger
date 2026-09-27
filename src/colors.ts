/**
 * Minimal ANSI styling. Replaces the former `chalk` dependency so that
 * fan-logger installs with zero dependencies and never conflicts with
 * whichever chalk version the host project happens to use.
 *
 * Every style is a plain `(text: string) => string`, which is exactly the
 * shape chalk 4, chalk 5, picocolors and kleur all satisfy - so
 * `log.log('BUILD', chalk.blueBright, '...')` keeps working unchanged.
 */

export type ColorFn = (text: string) => string;

const sgr = (open: number, close: number): ColorFn => {
    const prefix = '\u001B[' + open + 'm';
    const suffix = '\u001B[' + close + 'm';
    return (text) => prefix + text + suffix;
};

/** Composes styles left-to-right: combine(bgRed, white, bold)('x'). */
export function combine(...fns: ColorFn[]): ColorFn {
    return (text) => fns.reduce((acc, fn) => fn(acc), text);
}

export const colors = {
    reset: sgr(0, 0),
    bold: sgr(1, 22),
    dim: sgr(2, 22),
    italic: sgr(3, 23),
    underline: sgr(4, 24),
    inverse: sgr(7, 27),

    black: sgr(30, 39),
    red: sgr(31, 39),
    green: sgr(32, 39),
    yellow: sgr(33, 39),
    blue: sgr(34, 39),
    magenta: sgr(35, 39),
    cyan: sgr(36, 39),
    white: sgr(37, 39),
    gray: sgr(90, 39),
    grey: sgr(90, 39),

    redBright: sgr(91, 39),
    greenBright: sgr(92, 39),
    yellowBright: sgr(93, 39),
    blueBright: sgr(94, 39),
    magentaBright: sgr(95, 39),
    cyanBright: sgr(96, 39),
    whiteBright: sgr(97, 39),

    bgBlack: sgr(40, 49),
    bgRed: sgr(41, 49),
    bgGreen: sgr(42, 49),
    bgYellow: sgr(43, 49),
    bgBlue: sgr(44, 49),
    bgMagenta: sgr(45, 49),
    bgCyan: sgr(46, 49),
    bgWhite: sgr(47, 49),

    combine,
};

/** Matches SGR escape sequences, so output can be de-coloured per stream. */
const ANSI_PATTERN = /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-nqry=><]/g;

export function stripAnsi(text: string): string {
    return text.replace(ANSI_PATTERN, '');
}
