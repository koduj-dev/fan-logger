const chalk = require('chalk');
const util = require('util');

function isDebugEnabled() {
    return process.env.DEBUG === 'true' || process.env.DEBUG === '1';
}

function createLogger(namespace = '') {
    function getTimestamp() {
        return new Date().toISOString().split('T')[1].replace('Z', '');
    }

    function logWith(label, color, ...args) {
        const timestamp = chalk.dim(`[${getTimestamp()}]`);
        const ns = namespace ? `[${namespace}] ` : '';
        const tag = color(`[${label}]`);
        const msg = util.format(...args);
        console.log(`${timestamp} ${ns}${tag} ${msg}`);
    }

    function printSection(name = '', width = 80, color = chalk.magenta) {
        if (name && name.length > 0) {
            const title = ` [ ${name.toUpperCase()} ] `;
            const totalWidth = Math.max(width, title.length + 4);
            const remaining = totalWidth - title.length;

            const left = Math.floor(remaining / 2);
            const right = remaining - left;

            const line = '='.repeat(left) + title + '='.repeat(right);
            console.log(color(line));
        } else {
            console.log(color('='.repeat(width)));
        }
    }

    return {
        log: logWith,
        info: (...args) => logWith('INFO', chalk.cyan, ...args),
        warn: (...args) => logWith('WARN', chalk.yellow, ...args),
        error: (...args) => logWith('ERR', chalk.red, ...args),
        success: (...args) => logWith('OK', chalk.green, ...args),
        fatal: (...args) => logWith('FATAL', chalk.bgRed.white.bold, ...args),
        debug: (...args) => {
            if (isDebugEnabled()) logWith('DEBUG', chalk.gray, ...args);
        },
        section: (name = '', width = 80, color = chalk.magenta) => printSection(name, width, color),
        separator: (width = 80, color = chalk.gray) => printSection('', width, color),
        scope: (childNamespace) => createLogger(namespace ? `${namespace}:${childNamespace}` : childNamespace),
        child: (childNamespace) => createLogger(namespace ? `${namespace}:${childNamespace}` : childNamespace),
    };
}

module.exports = createLogger();
