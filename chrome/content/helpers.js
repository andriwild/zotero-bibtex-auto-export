// Pure helpers for TestPlugin. Loaded both by Zotero (via loadSubScript)
// and by Jest (via require). Must not reference Zotero, DOM, or XPCOM.

var TestPluginHelpers = (function() {
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

    return {
        replaceExtension: replaceExtension,
        extensionForTranslatorLabel: extensionForTranslatorLabel,
        findFormatKeyByTranslatorID: findFormatKeyByTranslatorID,
        parsePromptIndex: parsePromptIndex,
        countBibEntries: countBibEntries,
        buildExportHeader: buildExportHeader
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TestPluginHelpers;
}
