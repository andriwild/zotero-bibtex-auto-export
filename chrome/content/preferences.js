// Preferences pane init script for BibTeX Auto-Export.
// Loaded by Zotero.PreferencePanes.register({ scripts: [...] }).
//
// All button / menulist event handlers live in bootstrap.js as methods on
// Zotero.BibTeXAutoExport (called via inline `oncommand` from the XHTML).
// This file only does:
//   - i18n attribute application
//   - one-time initialization of the format menulist's selected value
//     (it's not bound via preference="..." because we have side effects)

(function() {
    var ROOT_ID = 'zotero-prefpane-bibtex-auto-export';

    function log(message) {
        try { Zotero.debug("[BibTeXAutoExport] prefs: " + message); } catch (e) {}
    }

    function applyI18nTo(el, i18n) {
        var key = el.getAttribute('data-i18n');
        if (!key) return;
        var text = i18n.t(key);
        if (text === key) return;

        var tag = (el.localName || el.tagName || '').toLowerCase();
        if (tag === 'label') {
            if (el.hasAttribute('value')) {
                el.setAttribute('value', text);
            } else {
                el.textContent = text;
            }
        } else if (tag === 'description') {
            el.textContent = text;
        } else if (tag === 'button' || tag === 'checkbox' || tag === 'menuitem') {
            el.setAttribute('label', text);
        } else {
            el.textContent = text;
        }
    }

    function init() {
        var root = document.getElementById(ROOT_ID);
        if (!root) {
            log("root not found yet (" + ROOT_ID + ")");
            return;
        }

        var i18n = (typeof Zotero !== 'undefined' && Zotero.BibTeXAutoExport && Zotero.BibTeXAutoExport.i18n) || null;
        if (i18n) {
            var nodes = root.querySelectorAll('[data-i18n]');
            for (var i = 0; i < nodes.length; i++) {
                applyI18nTo(nodes[i], i18n);
            }
        } else {
            log("i18n not available — labels stay as XHTML defaults");
        }

        // Restore the format menulist's current selection from prefs.
        var menulist = document.getElementById('bae-export-format');
        if (menulist) {
            var current = Zotero.Prefs.get('extensions.bibtex-auto-export.exportFormat') || 'bibtex';
            menulist.value = current;
        }

        log("initialized");
    }

    init();
})();
