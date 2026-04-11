# Changelog

All notable changes to this project are documented here. The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-04-11

**Renamed** to "Zotero Auto-Export". The previous name "Zotero BibTeX Auto-Export" was misleading because the plugin supports BibTeX, BibLaTeX, RIS, CSV, EndNote XML and CSL JSON, not just BibTeX.

### Breaking changes

- **Plugin ID changed** from `bibtex-auto-export@andriwild.github.io` to `auto-export@andriwild.github.io`. Zotero treats this as a different add-on, so existing users must uninstall the previous version manually and install v0.4.0 fresh. There is no automatic update path from v0.3.x.
- **Preference namespace changed** from `extensions.bibtex-auto-export.*` to `extensions.auto-export.*`. A one-time migration in `startup()` copies any old prefs into the new namespace on the first run of v0.4.0, so the export path, format, debounce delay and selected collection are preserved automatically.
- **XPI filename changed** to `zotero-auto-export.xpi`. The GitHub repository URL stays at `andriwild/zotero-bibtex-auto-export` for backwards compatibility with existing release links.

### Internal

- All JavaScript symbols renamed: `Zotero.BibTeXAutoExport` → `Zotero.AutoExport`, `BibTeXAutoExportHelpers` → `AutoExportHelpers`, `BibTeXAutoExportI18n` → `AutoExportI18n`, log prefix `[BibTeXAutoExport]` → `[AutoExport]`, DOM IDs `bibtex-auto-export-*` → `auto-export-*`, preferences pane root ID `zotero-prefpane-bibtex-auto-export` → `zotero-prefpane-auto-export`.

## [0.3.0] — 2026-04-11

### Added

- **Per-collection filter** — a new "Source" dropdown in the preferences pane lets you restrict the export to a single Zotero collection (and its subcollections) instead of the whole library. The collection tree is rebuilt every time the dropdown is opened, so newly created collections appear immediately. Stale collection keys (e.g. after deleting the configured collection) fall back to the whole library with a notification.
- Auto-export now respects the collection filter: when a collection is selected, item additions outside that subtree no longer trigger an export. Both `item` add and `collection-item` add events are observed so that drag-into-collection and deferred web-import assignments are caught.
- Notifier handler now uses a classic `setTimeout` + `clearTimeout` debounce with a 500 ms minimum window. Multiple notifier events fired by a single user action (item create + collection assignment + attached PDF) collapse into exactly one export.
- Empty-export guard: if 0 regular items remain after filtering, the file is left untouched and no notification is shown.

### Internal

- Extracted `buildCollectionTree` and `parseCollectionItemNotifierID` into `chrome/content/helpers.js` with full Jest coverage.
- 55 unit tests across helpers and i18n modules.

## [0.2.0] — 2026-04-10

### Added

- **Real preferences pane** under **Edit → Preferences → BibTeX Auto-Export**, replacing the previous `window.prompt`-based config dialogs. Uses Zotero 7's native XUL prefs pane API with `preference="…"` auto-binding for text/checkbox/number inputs.
- **Plugin icon** (`chrome/content/icon.svg`) shown in the Tools menu, the Add-ons list, and the preferences pane header.
- **Localization scaffolding**: all bootstrap-side strings (menu labels, notifications, error messages) go through `BibTeXAutoExportI18n.t(key, params)`. Strings live in `chrome/locale/en-US/messages.json`. Adding a new locale only requires dropping a translated `messages.json` into a sibling folder.
- First-run defaults: the plugin seeds `Zotero.Prefs` with sensible defaults on startup so the prefs pane bindings show real values instead of empty fields.

### Changed

- Tools menu reduced to two entries — **Export Now** and **Preferences…** — instead of the previous five-item config menu.
- Format change in the preferences pane automatically updates the file extension on the configured export path.

### Removed

- All `window.prompt`-based configuration dialogs.

## [0.1.1] — 2026-04-10

### Changed

- Renamed plugin and stabilised metadata: `Zotero BibTeX Auto-Export`, plugin ID `bibtex-auto-export@andriwild.github.io`, repository `andriwild/zotero-bibtex-auto-export`.
- Internal namespace: `Zotero.BibTeXAutoExport`, log prefix `[BibTeXAutoExport]`, preferences under `extensions.bibtex-auto-export.*`.
- Corrected `update.json` and `manifest.json` URLs to point at the real GitHub repository.

## [0.1.0] — 2026-04-10

Initial public release.

### Added

- Auto-export of the user library to a bibliography file on `item add`, with configurable debounce delay.
- Six output formats: BibTeX (default), BibLaTeX, RIS, CSV, EndNote XML, CSL JSON.
- Tools menu entries for manual export, auto-export toggle, path selection, format selection, and current settings display.
- Pre-write backup: the previous export is copied to `<filename>.backup` before being overwritten.
- Zotero 7 compatibility: `data.rootURI` handling, `onMainWindowLoad` / `onMainWindowUnload` hooks, multi-window menu injection.
- MIT license, GitHub Actions release workflow, `update.json` for in-Zotero updates.
