/**
 * CommonJS demo - this is also the shape Node 10 uses.
 *   node demo.js
 *   DEBUG=true node demo.js
 *   FAN_LOG_LEVEL=warn node demo.js
 */
const log = require('./dist/index.js');
const { colors } = log;

log.section('Basic logging');
log.info('Server started on port 3000');
log.success('Database connected');
log.warn('Disk space low');
log.error('Failed to load module');       // -> stderr
log.fatal('Unrecoverable failure');       // -> stderr

log.section('Debug');
log.debug('Only shown with DEBUG=true or level "debug"');

log.section('Custom label & colour');
log.log('BUILD', colors.blueBright, 'Compiling files...');
log.log('CUSTOM', colors.combine(colors.bgMagenta, colors.white, colors.bold), 'Styled output');

log.section('Scoped loggers');
const api = log.scope('API');
api.info('GET /users');
api.error('User not found');

const player = log.child('Player');
player.success('Playback started');
player.success({ playback: 'https://test.url/test', query: 'language=eng' });
player.scope('Loader').info('Loading player...');

log.child('Core').child('Auth').child('Token').error('Invalid token');

log.section('Sections & separators');
log.section('build');
log.section('release', 60, colors.cyan);
log.section('', 40);
log.separator();
log.separator(40);
log.separator(60, colors.greenBright);

log.section('Timestamps');
log.configure({ timestamp: 'iso' });
log.info('ISO timestamp');
log.configure({ timestamp: 'none' });
log.info('No timestamp');
log.configure({ timestamp: undefined });  // back to local time
log.info('Local time again');

log.section('Levels');
log.setLevel('warn');
log.info('you will not see this');
log.warn('warnings still get through');
log.setLevel('info');

log.processInfo();
