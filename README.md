# 📦 fan-logger

![npm version](https://img.shields.io/npm/v/fan-logger.svg)
![npm](https://img.shields.io/npm/l/fan-logger)
![node](https://img.shields.io/node/v/fan-logger.svg)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

Simple, pretty terminal logger with timestamps, colors, scopes, and zero fluff.  
Inspired by the need for readable logs in CLI tools and concurrent builds.

- **Zero dependencies.**
- **Works everywhere:** CommonJS *and* ESM, plus first-class TypeScript types.
- **Runs on Node 10 → Node 24.** The published CommonJS bundle is ES2018, and CI
  actually executes it on Node 10.24.1 rather than hoping.
- **Terminal first, browser-safe.** Bundled for a browser it degrades to plain
  `console.*` calls instead of failing to resolve Node built-ins.

---

## 🚀 Install

```bash
npm install fan-logger
```

---

## ✍️ Quick Example

A minimal setup showing the most useful log types, including scoping and nested loggers:

```js
const log = require('fan-logger');

log.info('Server started');
log.success('Connected to DB');
log.error('Connection failed');
log.debug('Only shown with DEBUG=true');

const api = log.scope('API');
api.warn('Rate limit exceeded');

const deep = log.child('Core').child('Auth');
deep.error('Invalid token');
```

The same thing with ESM or TypeScript — the default import *and* named imports both work:

```js
import log from 'fan-logger';
// or pick what you need:
import { info, scope, colors, setLevel } from 'fan-logger';

log.info('Server started');
info('also fine');
```

## 🧩 Output example

When running with `DEBUG=true`, the output looks like:

```
[13:14:41.911] [INFO] Server started
[13:14:41.912] [OK] Connected to DB
[13:14:41.912] [ERR] Connection failed
[13:14:41.912] [DEBUG] Only shown with DEBUG=true
[13:14:41.913] [API] [WARN] Rate limit exceeded
[13:14:41.913] [Core:Auth] [ERR] Invalid token
```

Each line is timestamped in **local time**, color-coded, and can include custom scopes
(e.g. `API`, `Core:Auth`) for better traceability in concurrent processes or modular systems.

---

## 🧵 Which stream goes where

`info`, `success`, `warn` and `debug` are written to **stdout**; `error` and `fatal` go to
**stderr**. That way `node build.js > build.log` keeps your log file clean while failures
still surface in the terminal, and CI picks errors up on the right stream.

```bash
node app.js 2>errors.log      # only [ERR] / [FATAL] land in errors.log
node app.js 2>/dev/null       # mute failures, keep the normal output
```

Colors are emitted only when the target stream is a TTY. Piped or redirected output is
plain text automatically — no escape-code noise in your log files.

In a browser there is no stdout/stderr, so the levels map onto the console instead:
`info` → `console.info`, `warn` → `console.warn`, `error`/`fatal` → `console.error`,
`debug` → `console.debug`, everything else → `console.log`.

---

## 🎚️ Log levels & silencing

> 💡 Especially useful when fan-logger is used inside a library: the host application
> decides how noisy it gets.

Levels, from most to least verbose: `debug` → `info` → `warn` → `error` → `fatal` → `silent`.
Anything below the active level is dropped. The default is `info`.

```js
log.setLevel('warn');    // info/success/debug are suppressed
log.setLevel('silent');  // nothing is printed at all
log.getLevel();          // -> 'silent'
```

Or without touching the code:

```bash
FAN_LOG_LEVEL=warn node app.js
FAN_LOG_LEVEL=silent node app.js
```

An explicit `setLevel()` call always wins over `FAN_LOG_LEVEL`.
`log()`, `section()`, `separator()` and `processInfo()` are informational, so they are
suppressed above the `info` level too.

---

## 🧠 Scoped / Namespaced logs

> 💡 This is great for libraries, background workers, microservices, and other concurrent environments.

Scoped loggers are useful when building modular applications — each module or component can have its own labeled output.  
These scopes will be automatically prefixed in the output.

```js
const playerLog = log.scope('Player');
playerLog.info('Playback started');
playerLog.error('Unsupported format');
```

You can also use `.child()` as an alias for `.scope()`:

```js
const mediaLog = log.child('Media');
mediaLog.success('Buffering complete');
```

Scopes support nesting, creating fully-qualified namespaces:

```js
log.scope('Video').child('Decoder').warn('Low buffer');
```

Every scoped logger is independent and exposes its own `namespace`:

```js
log.scope('Video').child('Decoder').namespace; // -> 'Video:Decoder'
```

---

## 🎨 Custom label and color

For full control over the label and its appearance, use `log.log(label, colorFn, ...args)`.  
Perfect for build systems, CI pipelines, or when you want more expressive output.

fan-logger ships its own dependency-free styles, so nothing extra to install:

```js
const { colors } = require('fan-logger');

log.log('BUILD', colors.blueBright, 'Compiling files...');
log.log('CUSTOM', colors.combine(colors.bgMagenta, colors.white, colors.bold), 'Styled output');
```

Output:
```
[13:14:41.985] [BUILD] Compiling files...
[13:14:41.986] [CUSTOM] Styled output
```

A color is just a `(text: string) => string` function, so **any** styling library works —
and any version of it. [chalk](https://www.npmjs.com/package/chalk) 4, chalk 5,
[picocolors](https://www.npmjs.com/package/picocolors) and
[kleur](https://www.npmjs.com/package/kleur) all satisfy that shape:

```js
const chalk = require('chalk');

log.log('BUILD', chalk.blueBright, 'Compiling files...');
log.log('CUSTOM', chalk.bgMagenta.white.bold, 'Styled output');
log.log('THEME', (text) => `<<${text}>>`, 'Or roll your own');
```

Built-in styles: `bold`, `dim`, `italic`, `underline`, `inverse`, the eight base colors
(`red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `black`), `gray`, their
`*Bright` variants, the `bg*` backgrounds, and `combine(...)` to stack them.

---

## 🧱 Section headers & separators

> 💡 Use separators between batches or major log groups for clarity in long CLI outputs.

Use `log.section()` to visually highlight a phase or block of your logs.  
Use `log.separator()` for clean visual spacing between log groups.

### 🔹 log.section(title?, width = 80, color = colors.magenta)
Prints a formatted section header, centered with decorative `=` characters.

```js
log.section('build');
log.section();
log.section('', 40);
log.section('release', 60, colors.cyan);
```

Output:
```
================================== [ BUILD ] ===================================
================================================================================
========================================
======================= [ RELEASE ] ========================
```

If the title does not fit the requested width, the line grows rather than truncating the title.

### 🔹 log.separator(width = 80, color = colors.gray)

Shorthand for a clean horizontal line.

```js
log.separator();
log.separator(40);
log.separator(60, colors.gray);
```

Output:
```
================================================================================
========================================
============================================================
```

---

## 🛠️ log.processInfo([title])
Logs useful diagnostic information about the current Node.js process and system.

```js
log.processInfo();             // defaults to "Process Info"
log.processInfo('Build Host'); // custom title
```

Example output:
```
=============================== [ PROCESS INFO ] ===============================
[13:14:42.183] [INFO] 🖥️  CPU model: Intel(R) Core(TM) i7-7820X CPU @ 3.60GHz @ 1200MHz
[13:14:42.183] [INFO] 🧵 CPU cores (logical): 16
[13:14:42.183] [INFO] 🧠 Total RAM: 94.0 GB
[13:14:42.183] [INFO] 💾 Free RAM: 89.9 GB
[13:14:42.183] [INFO] 🏃 Node heap limit: 4288 MB
[13:14:42.183] [INFO] 🔢 Node version: v24.21.0
[13:14:42.183] [INFO] 📦 V8 version: 13.6.233.17-node.53
[13:14:42.183] [INFO] 📎 Raw exec args: []
================================================================================
```

> 💡 Great for CLI tools, build scripts, and CI logs. Helps quickly identify runtime environment, memory usage, and debug flags.

Fields that the host cannot report (for example `os.cpus()` returning nothing inside a
container) are printed as `unknown` instead of throwing.

---

## ⏱️ Timestamps

Local time by default. `configure()` changes the format globally:

```js
const { configure } = require('fan-logger');

configure({ timestamp: 'local' });             // [13:14:41.911]  (default)
configure({ timestamp: 'utc' });               // [11:14:41.911]
configure({ timestamp: 'iso' });               // [2026-09-27T11:14:41.911Z]
configure({ timestamp: 'none' });              // [INFO] message
configure({ timestamp: () => Date.now() });    // bring your own
```

---

## 📎 Environment flags

| Variable            | Effect                                                              |
|---------------------|---------------------------------------------------------------------|
| `DEBUG`             | `true` or `1` enables `.debug(...)` output                          |
| `FAN_LOG_LEVEL`     | `debug` \| `info` \| `warn` \| `error` \| `fatal` \| `silent`        |
| `FAN_LOG_TIMESTAMP` | `local` \| `utc` \| `iso` \| `none`                                  |
| `NO_COLOR`          | set to disable colors ([no-color.org](https://no-color.org))        |
| `FORCE_COLOR`       | set to force colors on (`0` forces them off)                        |

```bash
DEBUG=true node demo.js
FAN_LOG_LEVEL=warn FAN_LOG_TIMESTAMP=iso node demo.js
```

---

## 📚 API Reference

| Method                                              | Description                                       |
|-----------------------------------------------------|---------------------------------------------------|
| `info(...)`                                         | Cyan log for general messages → stdout            |
| `warn(...)`                                         | Yellow log for warnings → stdout                  |
| `error(...)`                                        | Red log for errors → **stderr**                   |
| `fatal(...)`                                        | Red bold log for fatal errors → **stderr**        |
| `success(...)`                                      | Green log for positive output → stdout            |
| `debug(...)`                                        | Gray log (only if `DEBUG=true` or level `debug`)  |
| `log(label, colorFn, ...args)`                      | Custom label + color                              |
| `scope(name)`                                       | Namespaced logger (e.g. per module)               |
| `child(name)`                                       | Alias for `scope(...)`                            |
| `namespace`                                         | The current logger's namespace (`''` at the root) |
| `section(title?, width=80, colorFn=colors.magenta)` | Prints a visible section heading                  |
| `separator(width=80, colorFn=colors.gray)`          | Prints a separator with defined length and color  |
| `processInfo(title?)`                               | Print diagnostic table for process                |
| `setLevel(level)` / `getLevel()`                    | Read or change the active log level               |
| `configure({ level, timestamp, color })`            | Global configuration                              |
| `createLogger(namespace?)`                          | Create a standalone logger instance               |
| `colors` / `combine(...)` / `stripAnsi(text)`       | Built-in dependency-free styling helpers          |
| `reset()`                                           | Restore default configuration (handy in tests)    |

All of the above are available both as properties of the default export and as named
ESM imports.

---

## 🔧 Compatibility

| Consumer                                     | Entry point                |
|----------------------------------------------|----------------------------|
| `require('fan-logger')` on Node 10+          | `dist/index.js`            |
| `import` in Node 12.17+ / bundlers           | `dist/index.mjs`           |
| Bundled for a browser (`browser` condition)  | `dist/index.browser.mjs`   |
| TypeScript (`node10`, `node16`, `bundler`)   | matching `.d.ts`           |

### In the browser

fan-logger is a **terminal** logger first — timestamps, ANSI colors, `[SCOPE]` prefixes.
Bundled for a browser it keeps the same API and falls back to plain console logs:

- Output goes to `console.info` / `warn` / `error` / `debug` / `log`.
- ANSI is dropped, because devtools would render the escape codes as garbage.
- Arguments are handed to the console **untouched**, so objects stay expandable in
  devtools instead of being flattened into a string. `%s` / `%d` format strings still work.
- `processInfo()` reports what the browser can tell it (cores, device memory, JS heap
  limit, user agent) instead of Node's `os`/`v8` data.
- No Node built-in ever reaches the bundle — `npm run check:es2018` asserts that.

Nothing to configure: the `browser` export condition (and the legacy `browser` field for
webpack 4 / browserify) points bundlers at that build automatically.

---

## 🧪 Development

```bash
npm install
npm run build        # tsup -> CJS (ES2018) + ESM + browser builds + types
npm test             # vitest
npm run verify       # typecheck, build, tests, Node 10 gate, package lint, consumer matrix
node demo.js         # CommonJS demo
node demo.mjs        # ESM demo
```

`npm run verify` is what `prepublishOnly` runs. It includes:

- `check:es2018` — parses the built bundles to prove the CommonJS entry is ES2018 and
  free of `node:` specifiers or globals Node 10 lacks, and that the browser bundle
  references no Node built-ins.
- `check:package` — [publint](https://publint.dev) + [are-the-types-wrong](https://arethetypeswrong.github.io).
- `check:consumers` — installs the real tarball into throwaway CommonJS, ESM, TypeScript
  (against both chalk 4 and chalk 5) and browser-bundling projects, and asserts it
  imports and runs. Set `FAN_NODE10` to a Node 10 binary to include the Node 10 leg.

---

## ⬆️ Upgrading from 0.2.x

The documented API is unchanged — `require('fan-logger')` still returns the logger and
every method behaves the same. Three things to be aware of:

1. **`error()` and `fatal()` now write to stderr** instead of stdout. If you were capturing
   everything with `> out.log`, use `> out.log 2>&1`.
2. **Timestamps are local time**, not UTC. Set `FAN_LOG_TIMESTAMP=utc` to keep the old behaviour.
3. **chalk is no longer a dependency.** Passing your own `chalk` function to `log.log()` /
   `log.section()` still works exactly as before; `colors` is now bundled if you would
   rather not install chalk at all.

---

## 🪪 License

ISC — see [LICENSE](./LICENSE).
