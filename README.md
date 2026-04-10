# Zotero BibTeX Auto-Export

A Zotero 7 plugin that automatically exports your library to a bibliography file whenever new items are added — no manual "File → Export" step needed.

Supported formats: **BibTeX** (default), **BibLaTeX**, **RIS**, **CSV**, **EndNote XML**, **CSL JSON**.

## Who is this for

Anyone who keeps a `.bib` file (or other bibliography file) in sync with their Zotero library for use in LaTeX, pandoc, or another tool that reads from disk. Instead of re-exporting by hand every time you add a reference, this plugin writes the file for you a couple of seconds after each item is added.

## Requirements

- Zotero 7.0 or newer

## Installation

1. Download the latest `zotero-bibtex-auto-export.xpi` from the [Releases page](https://github.com/andriwild/zotero-bibtex-auto-export/releases).
2. In Zotero, open **Tools → Add-ons**.
3. Click the gear icon in the top-right of the Add-ons window and choose **Install Add-on From File…**.
4. Select the downloaded `.xpi`. Restart Zotero if prompted.

After installation a new entry **"BibTeX Auto-Export"** appears in the **Tools** menu.

## Usage

All actions live under **Tools → BibTeX Auto-Export**:

| Menu entry | What it does |
|---|---|
| **Export Now** | Run an export immediately. On first use, asks you to pick a target file. |
| **Auto-Export** | Toggle automatic export on/off (on by default). When on, every time you add items to your library the plugin writes the file a couple of seconds later. |
| **Change Export Path…** | Pick or change the target file via a file-picker dialog. |
| **Choose Export Format…** | Switch between BibTeX, BibLaTeX, RIS, CSV, EndNote XML or CSL JSON. The target file's extension is updated automatically. |
| **Show Current Settings** | Show the current target path, format, auto-export state, delay, and number of items that would be exported. |

### Backups

Before overwriting the target file, the plugin copies the previous version next to it as `<filename>.backup`. Only one backup is kept; it is replaced on each export.

### Debounce delay

Auto-export waits `exportDelay` milliseconds (default: 2000) after each `item add` notification before running, so importing a batch of references only triggers one export at the end.

## Preferences

Settings are stored in Zotero's preferences under the `extensions.bibtex-auto-export.*` namespace and can be edited via **Edit → Preferences → Advanced → Config Editor** if needed:

| Preference | Default | Meaning |
|---|---|---|
| `extensions.bibtex-auto-export.exportPath` | *(unset)* | Absolute path to the bibliography file |
| `extensions.bibtex-auto-export.exportFormat` | `bibtex` | Format key |
| `extensions.bibtex-auto-export.translatorID` | BibTeX translator ID | Zotero translator to use |
| `extensions.bibtex-auto-export.autoExport` | `true` | Whether to export on item-add |
| `extensions.bibtex-auto-export.exportDelay` | `2000` | Debounce delay in ms |

## Known limitations

- Format and path selection use native dialog prompts (no dedicated preferences pane yet).
- The entire user library is exported on every run; per-collection or per-tag filtering is not implemented.
- Only the first automatic `.backup` file is kept — older versions are overwritten.
- English only; no localized strings.

## License

MIT — see [LICENSE](LICENSE).

---

# Development

The sections below are for contributors working on the plugin itself.

## Project layout

```
manifest.json                 Zotero 7 extension manifest
bootstrap.js                  All plugin runtime logic; exports startup/shutdown/onMainWindowLoad/onMainWindowUnload
chrome/content/helpers.js     Pure helper functions (no Zotero APIs) — dual-loadable by Zotero and Jest
chrome/locale/en-US/          Currently empty (no localization yet)
package.json                  Dev harness for Jest — not shipped in the XPI
test/helpers.test.js          Unit tests for the helpers
update.json                   Zotero update manifest served from the repo's main branch
.github/workflows/release.yml Tag-triggered build & release workflow
```

All runtime logic lives as a single object literal `Zotero.BibTeXAutoExport` in `bootstrap.js`. `startup(data, reason)` loads `helpers.js` via `Services.scriptloader.loadSubScript` (using `data.rootURI`, which Zotero 7 provides as a string), registers the notifier observer, and then — once `Zotero.uiReadyPromise` resolves — installs the Tools menu on any already-open main windows. Windows opened later are handled by the top-level `onMainWindowLoad` / `onMainWindowUnload` hooks that Zotero 7 calls per window.

## Build

There is no build system. The XPI is just a zip of the runtime files:

```sh
zip -r zotero-bibtex-auto-export.xpi manifest.json bootstrap.js chrome/ LICENSE
```

Important: `package.json`, `node_modules/`, `test/`, `update.json` and `.github/` must not end up inside the XPI — the command above only includes the four paths explicitly, so this is already taken care of.

For debugging, use **Help → Debug Output Logging** in Zotero; the plugin's log lines are prefixed with `[BibTeXAutoExport]`.

## Tests

Pure string/path/counting logic is extracted into `chrome/content/helpers.js` and unit-tested with Jest, so those helpers can be tested without starting a Zotero instance.

```sh
npm install                                           # first time only
npm test
npx jest test/helpers.test.js -t replaceExtension     # run a single describe/test
```

`helpers.js` is **dual-loadable**:

- **In Zotero**: `bootstrap.js` calls `Services.scriptloader.loadSubScript(rootURI + "chrome/content/helpers.js")` at the top of `startup()`. The file declares `var BibTeXAutoExportHelpers = (function() { ... })();`, exposing the helpers as a sandbox global in the bootstrap scope.
- **In Node/Jest**: a `module.exports` guard at the bottom of the file exports the same object via CommonJS, so `require('../chrome/content/helpers')` works from test code.

**Important**: `helpers.js` must not reference any Zotero APIs, DOM, or XPCOM — otherwise the Node-side tests break. Anything that needs Zotero access stays in `bootstrap.js`.

Currently covered:

- `replaceExtension` — swapping the extension of a path (including dotted directory names and paths without an extension).
- `extensionForTranslatorLabel` — mapping a translator label (e.g. `"BibLaTeX"`, `"CSL JSON"`) to a file extension.
- `findFormatKeyByTranslatorID` — reverse lookup in the translators map.
- `parsePromptIndex` — validating user input from the format-selection prompt (1-based → 0-based, range check).
- `countBibEntries` — counting `@` entries in BibTeX content, falling back to line count.
- `buildExportHeader` — generating the `%`-comment header for BibTeX/BibLaTeX exports.

26 tests total. Anything that depends on the Zotero runtime (notifier, `Zotero.Translate.Export`, XUL menu, file writes) is **not** unit-testable here — that would require an integration test setup running inside a real Zotero instance.

## Release process

Releases are cut by pushing a `v*` tag. The GitHub Actions workflow in `.github/workflows/release.yml`:

1. Checks out the repo.
2. Verifies that `manifest.json`'s `version` field matches the tag (minus the leading `v`).
3. Builds the XPI with the same `zip` command documented above.
4. Creates a GitHub release with auto-generated release notes and attaches the XPI as an asset.

`update.json` is maintained by hand: before cutting a new tag, bump `manifest.json` `version`, add a new entry to `update.json`'s `updates` array pointing at the download URL of the XPI that the workflow will upload, and only then push the tag.

Zotero 7 clients check `update.json` at the URL configured in `manifest.json` (`applications.zotero.update_url`) and offer updates automatically.

## Conventions

- No ES modules, no `require` inside `bootstrap.js` — the bootstrapped loader evaluates the file as a plain script in Zotero's sandbox global.
- Menu injection uses the Zotero 7 `onMainWindowLoad` / `onMainWindowUnload` hooks; `addMenu(window)` and `removeMenu(window)` both take an explicit window argument so multi-window sessions work correctly.
- Prefer `Zotero.File.pathToFile` + `Zotero.File.putContentsAsync` for file I/O over raw `nsIFile` flows.
- User feedback: `Zotero.ProgressWindow` (`notifyUser()`) for non-blocking toasts; avoid `window.alert` (the main window may not exist when the notifier fires).
- New pure logic belongs in `chrome/content/helpers.js` with matching Jest tests.
