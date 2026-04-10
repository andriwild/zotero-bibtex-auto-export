// Tiny i18n module for the BibTeX Auto-Export plugin.
// Dual-loadable: Zotero loads via Services.scriptloader.loadSubScript,
// Jest requires via CommonJS.
//
// Usage:
//   BibTeXAutoExportI18n.init(messagesObject);
//   BibTeXAutoExportI18n.t("menu.exportNow");
//   BibTeXAutoExportI18n.t("notify.exportComplete", { count: 5 });
//
// The init() call accepts a flat key→string object (parsed messages.json).
// Placeholders use {name} syntax and are substituted by t().

var BibTeXAutoExportI18n = (function() {
    var messages = {};

    function init(parsedMessages) {
        messages = parsedMessages || {};
    }

    function t(key, params) {
        var template = messages[key];
        if (template === undefined || template === null) {
            return key;
        }
        if (!params) {
            return template;
        }
        return template.replace(/\{(\w+)\}/g, function(match, name) {
            if (Object.prototype.hasOwnProperty.call(params, name)) {
                return String(params[name]);
            }
            return match;
        });
    }

    function has(key) {
        return Object.prototype.hasOwnProperty.call(messages, key);
    }

    function reset() {
        messages = {};
    }

    return {
        init: init,
        t: t,
        has: has,
        reset: reset
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BibTeXAutoExportI18n;
}
