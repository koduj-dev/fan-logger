const log = require('./');
const chalk = require('chalk');

log.section('Basic logging');
log.info('Server started on port 3000');
log.success('Database connected');
log.warn('Disk space low');
log.error('Failed to load module');

log.section('Debug');
log.debug('Only shown if DEBUG=true');

log.section('Custom label');
log.log('BUILD', chalk.blueBright, 'Building frontend...');
log.log('CUSTOM', chalk.magenta, 'Custom message output');

log.section('Scoped loggers');
const apiLog = log.scope('API');
apiLog.info('GET /users');
apiLog.error('User not found');

const playerLog = log.child('Player');
playerLog.success('Playback started');
playerLog.success({ playback: 'https://test.url/test', query: "language=eng" });

const playerLoaderLog = playerLog.scope('Loader');
playerLoaderLog.info('Loading player...');

log.section('');

log.section('Blue line', 80, chalk.blue);
log.section('Red line', 30, chalk.red);
log.section('Green line', 0, chalk.green);
log.separator(60, chalk.greenBright);

log.separator();

log.separator();
log.separator(40);
log.separator(60, chalk.gray)

log.section('build');
log.section();
log.section('', 40);
log.section('release', 60, chalk.cyan);

log.fatal("FATAL ERROR!");