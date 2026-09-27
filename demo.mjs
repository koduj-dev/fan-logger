/**
 * ESM demo, including the named imports that fan-logger 0.2.0 could not do.
 *   node demo.mjs
 */
import log, { colors, createLogger, info, scope, setLevel } from './dist/index.mjs';

log.section('ESM: default import');
info('named import works too');
scope('API').warn('Rate limit exceeded');

log.section('ESM: named imports');
createLogger('Worker').success('Job finished');
log.log('BUILD', colors.blueBright, 'Compiling files...');

setLevel('error');
log.info('suppressed at level "error"');
log.error('but errors still print, on stderr');
setLevel('info');

log.processInfo('ESM host');
