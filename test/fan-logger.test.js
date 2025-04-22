
const chalk = require('chalk');
const stripAnsi = require('strip-ansi');

describe('fan-logger', () => {
    let log;

    beforeEach(() => {
        jest.resetModules();
        log = require('../index');
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        console.log.mockRestore();
        delete process.env.DEBUG;
    });

    test('info(...) should print [INFO]', () => {
        log.info('Hello info');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    });

    test('warn(...) should print [WARN]', () => {
        log.warn('Warning!');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    });

    test('error(...) should print [ERR]', () => {
        log.error('Something went wrong');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[ERR]'));
    });

    test('success(...) should print [O✓]', () => {
        log.success('All good!');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[OK]'));
    });

    test('debug(...) should not print without DEBUG=true', () => {
        log.debug('Hidden debug');
        expect(console.log).not.toHaveBeenCalled();
    });

    test('debug(...) should print if DEBUG=true', () => {
        process.env.DEBUG = 'true';
        jest.resetModules();
        log = require('../index');
        log.debug('Visible debug');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
    });

    test('fatal(...) should print [FATAL]', () => {
        log.fatal('Catastrophic failure');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[FATAL]'));
    });

    test('log(...) should print custom label and message', () => {
        log.log('CUSTOM', chalk.magenta, 'Test log');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[CUSTOM]'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test log'));
    });

    test('scope(...) should prefix log with scope', () => {
        const apiLog = log.scope('API');
        apiLog.info('GET /');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[API]'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    });

    test('child(...) should behave same as scope', () => {
        const playerLog = log.child('Player');
        playerLog.success('Started');
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[Player]'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[OK]'));
    });

    test('section(...) should print section header', () => {
        log.section('SETUP');
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/=+\s+\[ SETUP \]\s+=+/));
    });

    test('log(...) should handle objects correctly', () => {
        log.log('DATA', chalk.blue, { foo: 'bar', baz: 42 });

        const call = console.log.mock.calls[0][0];

        expect(call).toContain('[DATA]');
        expect(call).toContain('foo');
        expect(call).toContain('bar');
        expect(call).toContain('baz');
        expect(call).toContain('42');
    });

    test('chained child() should concatenate namespaces', () => {
        const nested = log.child('Core').child('Utils');
        nested.info('Nested log');

        const call = console.log.mock.calls[0][0];
        expect(call).toContain('[Core:Utils]');
        expect(call).toContain('[INFO]');
        expect(call).toContain('Nested log');
    });

    test('chained scope() should also concatenate namespaces', () => {
        const nested = log.scope('Server').scope('HTTP');
        nested.warn('Route missing');

        const call = console.log.mock.calls[0][0];
        expect(call).toContain('[Server:HTTP]');
        expect(call).toContain('[WARN]');
        expect(call).toContain('Route missing');
    });

    test('deeply nested child() loggers should concatenate full namespace', () => {
        const deep = log.child('Core').child('Auth').child('Token').child('Refresh');
        deep.success('Token renewed');

        const call = console.log.mock.calls[0][0];
        expect(call).toContain('[Core:Auth:Token:Refresh]');
        expect(call).toContain('[OK]');
        expect(call).toContain('Token renewed');
    });

    test('section(...) should print formatted section with correct width', () => {
        const WIDTH = 50;
        log.section('build phase', WIDTH, chalk.green);

        const rawOutput = console.log.mock.calls[0][0];
        const cleanOutput = stripAnsi(rawOutput);

        expect(cleanOutput.length).toBe(WIDTH);
        expect(cleanOutput).toContain('[ BUILD PHASE ]');
    });

    test('section() without name should print full-width separator', () => {
        const WIDTH = 40;
        log.section('', WIDTH, chalk.blue);

        const rawOutput = console.log.mock.calls[0][0];
        const cleanOutput = stripAnsi(rawOutput);

        expect(cleanOutput.length).toBe(WIDTH);
        expect(cleanOutput).not.toContain('[');
    });

    test('separator() should print horizontal line', () => {
        log.separator();

        const printed = console.log.mock.calls[0][0];
        expect(stripAnsi(printed)).toMatch(/^=+$/);
    });

    test('separator(40) should print line of given length', () => {
        log.separator(40);

        const printed = console.log.mock.calls[0][0];
        expect(stripAnsi(printed)).toMatch(/^={40}$/);
    });
});