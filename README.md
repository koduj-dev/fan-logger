
# 📦 fan-logger

![npm version](https://img.shields.io/npm/v/fan-logger.svg)
![license](https://img.shields.io/npm/l/fan-logger.svg)
![node](https://img.shields.io/node/v/fan-logger.svg)

Simple, pretty terminal logger with timestamps, colors, scopes, and zero fluff.  
Inspired by the need for readable logs in CLI tools and concurrent builds.

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

## 🧩 Output example

When running with DEBUG=true, the output looks like:

```
[15:51:22.687] [INFO] Server started
[15:51:22.688] [OK] Connected to DB
[15:51:22.688] [ERR] Connection failed
[15:52:22.688] [DEBUG] Only shown with DEBUG=true
[15:51:22.688] [API] [WARN] Rate limit exceeded
[15:51:22.688] [Core:Auth] [ERR] Invalid token
```

Each line is timestamped, color-coded, and can include custom scopes (e.g. API, Core:Auth) for better traceability in concurrent processes or modular systems.

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

You can also use .child() as an alias for .scope():

```js
const mediaLog = log.child('Media');
mediaLog.success('Buffering complete');
```

Scopes support nesting, creating fully-qualified namespaces:

```js
log.scope('Video').child('Decoder').warn('Low buffer');
```

---

## 🎨 Custom label and color

For full control over the label and its appearance, use `log.log(label, colorFn, ...args)`.  
Perfect for build systems, CI pipelines, or when you want more expressive output.

```js
const chalk = require('chalk');

log.log('BUILD', chalk.blueBright, 'Compiling files...');
log.log('CUSTOM', chalk.bgMagenta.white.bold, 'Styled output');
```

Output:
```
[BUILD] Compiling files...
[CUSTOM] Styled output
```

You can use any [chalk](https://www.npmjs.com/package/chalk) styles or even define your own themes.

---

## 🧱 Section headers & separators

> 💡 Use separators between batches or major log groups for clarity in long CLI outputs.

Use `log.section()` to visually highlight a phase or block of your logs.  
Use `log.separator()` for clean visual spacing between log groups.

### 🔹log.section(title?, width = 80, color = chalk.magenta) 
Prints a formatted section header, centered with decorative `=` characters.

```js
log.section('build');
log.section(); 
log.section('', 40);
log.section('release', 60, chalk.cyan);
```

Output:
```terminaloutput
================================== [ BUILD ] ===================================
================================================================================
========================================
======================= [ RELEASE ] ========================

```

### 🔹log.separator(width = 80, color = chalk.gray)

Shorthand for a clean horizontal line.

```js
log.separator();
log.separator(40);
log.separator(60, chalk.gray)
```

Output:
```terminaloutput
================================================================================
========================================
============================================================
```

---

## 📎 Environment flags

Set `DEBUG=true` to enable `.debug(...)` output

```bash
DEBUG=true node demo.js
```

---

## 📚 API Reference

| Method                                              | Description                                      |
|-----------------------------------------------------|--------------------------------------------------|
| `info(...)`                                         | Cyan log for general messages                    |
| `warn(...)`                                         | Yellow log for warnings                          |
| `error(...)`                                        | Red log for errors                               |
| `fatal(...)`                                        | Red bold log for fatal errors                    |
| `success(...)`                                      | Green log for positive output                    |
| `debug(...)`                                        | Gray log (only if `DEBUG=true`)                  |
| `log(label, colorFn, ...args)`                      | Custom label + color                             |
| `scope(name)`                                       | Namespaced logger (e.g. per module)              |
| `child(name)`                                       | Alias for `scope(...)`                           |
| `section(title, width=80, colorFn = chalk.magenta)` | Prints a visible section heading                 |
| `separator(width=80, colorFn = chalk.magenta)`      | Prints a separator with defined length and color |

---

## 🪪 License

MIT