/**
 * Runs the built CommonJS bundle on Node 10 and asserts it behaves.
 *
 * This file must itself stay ES2018: no optional chaining, no nullish
 * coalescing, no `node:` specifiers, no template-literal-only tricks that
 * Node 10 lacks. It is executed by the `node10` CI job.
 */
'use strict';

var assert = require('assert');
var path = require('path');

var entry = path.join(__dirname, '..', 'dist', 'index.js');
var log = require(entry);

var lines = [];
var realLog = console.log;
var realErr = console.error;
console.log = function (line) { lines.push(['out', String(line)]); };
console.error = function (line) { lines.push(['err', String(line)]); };

function restore() {
    console.log = realLog;
    console.error = realErr;
}

try {
    // `require()` must be the logger itself, as in 0.2.x.
    var api = [
        'info', 'warn', 'error', 'success', 'debug', 'fatal', 'log',
        'scope', 'child', 'section', 'separator', 'processInfo',
        'setLevel', 'getLevel', 'configure', 'createLogger', 'reset',
        'stripAnsi', 'combine',
    ];
    for (var i = 0; i < api.length; i++) {
        assert.strictEqual(typeof log[api[i]], 'function', 'missing export: ' + api[i]);
    }
    assert.strictEqual(typeof log.colors, 'object', 'missing export: colors');
    assert.strictEqual(log.default, log, 'log.default should self-reference');

    log.configure({ color: false });

    log.info('info');
    log.success('success');
    log.warn('warn');
    log.error('error');
    log.fatal('fatal');
    log.scope('API').child('Auth').info('nested');
    log.log('BUILD', log.colors.blueBright, 'custom label');
    log.section('build', 40);
    log.separator(20);
    log.processInfo('node 10');

    var out = lines.filter(function (l) { return l[0] === 'out'; }).map(function (l) { return l[1]; });
    var err = lines.filter(function (l) { return l[0] === 'err'; }).map(function (l) { return l[1]; });
    var outText = out.join('\n');
    var errText = err.join('\n');

    assert.ok(outText.indexOf('[INFO] info') !== -1, 'missing [INFO]');
    assert.ok(outText.indexOf('[OK] success') !== -1, 'missing [OK]');
    assert.ok(outText.indexOf('[WARN] warn') !== -1, 'missing [WARN]');
    assert.ok(errText.indexOf('[ERR] error') !== -1, 'error must go to stderr');
    assert.ok(errText.indexOf('[FATAL] fatal') !== -1, 'fatal must go to stderr');
    assert.ok(outText.indexOf('[API:Auth] [INFO] nested') !== -1, 'namespace nesting broken');
    assert.ok(outText.indexOf('[BUILD] custom label') !== -1, 'custom label broken');
    assert.ok(outText.indexOf('[ BUILD ]') !== -1, 'section title broken');
    assert.ok(/(^|\n)={20}(\n|$)/.test(outText), 'separator width broken');
    assert.ok(outText.indexOf('Node version: ' + process.version) !== -1, 'processInfo broken');

    // Local time, not UTC - Node 10 has small-icu, so this is formatted by hand.
    var stamp = outText.match(/^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})]/m);
    assert.ok(stamp, 'expected a [hh:mm:ss.mmm] timestamp, got: ' + out[0]);
    assert.strictEqual(stamp[1], String(new Date().getHours()).replace(/^(\d)$/, '0$1'),
        'timestamp should be local time');

    // Levels must actually silence output.
    lines.length = 0;
    log.setLevel('silent');
    log.info('nope');
    log.error('nope');
    log.section('nope');
    assert.strictEqual(lines.length, 0, 'level "silent" did not silence output');
    log.setLevel('info');

    restore();
    console.log('✓ fan-logger CommonJS build works on ' + process.version);
} catch (error) {
    restore();
    console.error('✖ Node 10 smoke test failed on ' + process.version);
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
}
