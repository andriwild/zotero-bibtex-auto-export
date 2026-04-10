# Zotero Auto-Export Plugin

A bootstrapped Zotero plugin (Zotero 6, `strict_min_version` 6.0 / `strict_max_version` 7.0.\*) that automatically exports the user library to a bibliography file whenever new items are added. Supported formats: BibTeX (default), BibLaTeX, RIS, CSV, EndNote XML, CSL JSON.

The plugin ID is `testplugin@example.com`. After startup, a **"BibTeX Auto-Export"** entry appears in the Tools menu with actions for manual export, toggling auto-export, choosing the target path and format, and showing the current settings.

## Features

- **Auto-export on `item add`** — registers a `Zotero.Notifier` observer and exports with a configurable delay (`exportDelay`, default 2000 ms) to debounce bursts.
- **Manual export** via the "Export Now" menu entry.
- **Format and path selection** through dialogs; the file extension is updated automatically when the format changes.
- **Backups** — before overwriting the target file, the plugin creates a `.backup` copy next to it.
- **Persistence** — all settings live under `extensions.testplugin.*` in `Zotero.Prefs`.

## Installation

There is no build system; the XPI is simply a zip of the relevant files:

```sh
zip -r testplugin.xpi manifest.json bootstrap.js chrome/
```

Important: `package.json`, `node_modules/` and `test/` must **not** end up in the XPI — they exist purely for the dev workflow. The command above only picks up `manifest.json`, `bootstrap.js` and `chrome/` explicitly, so this is already handled.

Install in Zotero via **Tools → Add-ons → gear icon → "Install Add-on From File…"** and pick `testplugin.xpi`.

For debugging, use **Help → Debug Output Logging**; the plugin's log lines are prefixed with `[TestPlugin]`.

## Project layout

```
manifest.json                 Zotero extension manifest (plugin ID, version, Zotero version range)
bootstrap.js                  All plugin runtime logic; exports startup/shutdown/install/uninstall
bootstrap_backup.js           Older, smaller variant of the plugin — kept for reference, not loaded
chrome/content/helpers.js     Pure helper functions (no Zotero APIs) — dual-loadable by Zotero and Jest
chrome/locale/en-US/          Currently empty (no localization yet)
package.json                  Dev harness for Jest — not shipped in the XPI
test/helpers.test.js          Unit tests for the helpers
```

All runtime logic lives as a single object literal `Zotero.TestPlugin` in `bootstrap.js`. `startup()` first loads `helpers.js` via `Services.scriptloader.loadSubScript`, then builds the `Zotero.TestPlugin` object, and after a 1-second delay registers the notifier observer and installs the Tools menu. The delay is intentional: when `startup` fires, the main window is not guaranteed to be fully constructed yet.

## Tests

Pure string/path/counting logic is extracted into `chrome/content/helpers.js` and unit-tested with Jest. This lets those helpers be tested without starting a Zotero instance.

```sh
npm install                                           # first time only
npm test
npx jest test/helpers.test.js -t replaceExtension     # run a single describe/test
```

`helpers.js` is a **dual-loadable** file:

- **In Zotero**: `bootstrap.js` calls `Services.scriptloader.loadSubScript(data.resourceURI.spec + "chrome/content/helpers.js")` at the top of `startup()`. The file declares `var TestPluginHelpers = (function() { ... })();`, exposing the helpers as a sandbox global in the bootstrap scope.
- **In Node/Jest**: at the bottom of the file, an `if (typeof module !== 'undefined' && module.exports)` guard exports the same object via CommonJS, so `require('../chrome/content/helpers')` works from test code.

**Important**: `helpers.js` must not reference any Zotero APIs, DOM, or XPCOM — otherwise the Node-side tests break. Anything that needs Zotero access stays in `bootstrap.js`.

What is currently covered:

- `replaceExtension` — swapping the extension of a path (including dotted directory names and paths without an extension).
- `extensionForTranslatorLabel` — mapping a translator label (e.g. `"BibLaTeX"`, `"CSL JSON"`) to a file extension.
- `findFormatKeyByTranslatorID` — reverse lookup in the translators map.
- `parsePromptIndex` — validating user input from the format-selection prompt (1-based → 0-based, range check).
- `countBibEntries` — counting `@` entries in BibTeX content, falling back to line count.
- `buildExportHeader` — generating the `%`-comment header for BibTeX/BibLaTeX exports.

26 tests in total. Anything that depends on the Zotero runtime (notifier, `Zotero.Translate.Export`, XUL menu, file writes) is **not** unit-testable here — that would require an integration test setup running inside a real Zotero instance.

## Conventions

- No ES modules, no `require` inside `bootstrap.js` — the bootstrapped loader evaluates the file as a plain script in Zotero's sandbox global.
- Always use `Zotero.getMainWindow()` for DOM, timers and dialogs; `window`/`setTimeout` are not globals in this scope.
- Prefer `Zotero.File.pathToFile` + `Zotero.File.putContentsAsync` for file I/O over raw `nsIFile` flows.
- User feedback: `Zotero.ProgressWindow` (`notifyUser()`) for non-blocking toasts, `mainWindow.alert` only for errors or long summaries.
- New pure logic belongs in `chrome/content/helpers.js` with matching Jest tests.
