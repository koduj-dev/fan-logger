const chalk = require('chalk');
const util = require('util');
const os = require("os");
const v8 = require("v8");

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

    function processInfo(title = 'Process Info') {
        const cpuInfo = os.cpus()[0];

        printSection(title);
        logWith('INFO', chalk.cyan, `🖥️  CPU model: ${cpuInfo.model} @ ${cpuInfo.speed}MHz`);
        logWith('INFO', chalk.cyan, `🧵 CPU cores (logical): ${os.cpus().length}`);
        logWith('INFO', chalk.cyan, `🧠 Total RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
        logWith('INFO', chalk.cyan, `💾 Free RAM: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
        logWith('INFO', chalk.cyan, `🏃 Node heap limit: ${Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024)} MB`);

        logWith('INFO', chalk.cyan, `🔢 Node version: ${process.version}`);
        logWith('INFO', chalk.cyan, `📦 V8 version: ${process.versions.v8}`);

        logWith('INFO', chalk.cyan, `📎 Raw exec args: ${JSON.stringify(process.execArgv)}`);
        printSection();
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
        processInfo,
    };
}

module.exports = createLogger();
