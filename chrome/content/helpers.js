// Pure helpers for the BibTeX Auto-Export plugin. Loaded both by Zotero (via loadSubScript)
// and by Jest (via require). Must not reference Zotero, DOM, or XPCOM.

var BibTeXAutoExportHelpers = (function() {
    function replaceExtension(path, newExtension) {
        if (typeof path !== 'string' || !path) return path;
        var withoutExt = path.replace(/\.[^/.]+$/, "");
        return withoutExt + newExtension;
    }

    function extensionForTranslatorLabel(label) {
        if (!label) return '.bib';
        if (label.indexOf('RIS') !== -1) return '.ris';
        if (label.indexOf('CSV') !== -1) return '.csv';
        if (label.indexOf('EndNote') !== -1) return '.xml';
        if (label.indexOf('JSON') !== -1) return '.json';
        return '.bib';
    }

    function findFormatKeyByTranslatorID(translators, translatorID) {
        var keys = Object.keys(translators);
        for (var i = 0; i < keys.length; i++) {
            if (translators[keys[i]].id === translatorID) return keys[i];
        }
        return null;
    }

    function parsePromptIndex(input, length) {
        if (input === null || input === undefined || input === '') return null;
        var index = parseInt(input, 10) - 1;
        if (isNaN(index) || index < 0 || index >= length) return null;
        return index;
    }

    function countBibEntries(content) {
        if (!content) return 0;
        var atMatches = content.match(/@/g);
        if (atMatches && atMatches.length > 0) return atMatches.length;
        return content.split('\n').length - 1;
    }

    function buildExportHeader(format, timestamp, itemCount) {
        if (format && format.indexOf('bib') !== -1) {
            return "% Automatically exported: " + timestamp + "\n" +
                   "% Number of entries: " + itemCount + "\n\n";
        }
        return "";
    }

    // Takes a flat array of objects with `key`, `parentKey` and `name`
    // (e.g. Zotero Collection instances) and returns an array of root
    // tree nodes. Each node has `.item` (original object) and `.children`
    // (array of child nodes). Children are sorted alphabetically by name,
    // case-insensitive, at every level.
    //
    // Orphan nodes — whose parentKey does not match any key in the input
    // — are treated as roots. Nodes without a parentKey are also roots.
    // Cycles are not detected; the input is trusted to be acyclic, which
    // matches Zotero's collection model.
    function buildCollectionTree(items) {
        if (!Array.isArray(items) || items.length === 0) return [];

        var byKey = {};
        var i;
        for (i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || typeof it.key !== 'string') continue;
            byKey[it.key] = { item: it, children: [] };
        }

        var roots = [];
        for (i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item || typeof item.key !== 'string') continue;
            var node = byKey[item.key];
            var pk = item.parentKey;
            if (pk && byKey[pk]) {
                byKey[pk].children.push(node);
            } else {
                roots.push(node);
            }
        }

        function sortNodes(nodes) {
            nodes.sort(function(a, b) {
                var an = String((a.item && a.item.name) || '');
                var bn = String((b.item && b.item.name) || '');
                return an.toLowerCase().localeCompare(bn.toLowerCase());
            });
            for (var j = 0; j < nodes.length; j++) sortNodes(nodes[j].children);
        }
        sortNodes(roots);

        return roots;
    }

    return {
        replaceExtension: replaceExtension,
        extensionForTranslatorLabel: extensionForTranslatorLabel,
        findFormatKeyByTranslatorID: findFormatKeyByTranslatorID,
        parsePromptIndex: parsePromptIndex,
        countBibEntries: countBibEntries,
        buildExportHeader: buildExportHeader,
        buildCollectionTree: buildCollectionTree
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BibTeXAutoExportHelpers;
}
