var rootURI;
var prefsPaneID;

if (typeof Zotero !== 'undefined') {
    Zotero.BibTeXAutoExport = {};
}

async function startup(data, reason) {
    rootURI = data.rootURI || (data.resourceURI && data.resourceURI.spec);

    Services.scriptloader.loadSubScript(rootURI + "chrome/content/helpers.js");
    Services.scriptloader.loadSubScript(rootURI + "chrome/content/i18n.js");

    // Load locale messages. Zotero.locale is e.g. "en-US"; we currently
    // ship en-US only and fall back to it for any other locale.
    let messages = {};
    try {
        let response = await fetch(rootURI + "chrome/locale/en-US/messages.json");
        messages = await response.json();
    } catch (e) {
        Services.console.logStringMessage("[BibTeXAutoExport] Failed to load messages: " + e.message);
    }
    BibTeXAutoExportI18n.init(messages);

    // Seed first-run defaults so the prefs pane bindings show real values
    // (an unset pref renders as empty / unchecked).
    function setDefaultPref(key, value) {
        if (Zotero.Prefs.get('extensions.bibtex-auto-export.' + key) === undefined) {
            Zotero.Prefs.set('extensions.bibtex-auto-export.' + key, value);
        }
    }
    setDefaultPref('exportFormat', 'bibtex');
    setDefaultPref('translatorID', '9cb70025-a888-4a29-a210-93ec52da40d4');
    setDefaultPref('autoExport', true);
    setDefaultPref('exportDelay', 2000);
    setDefaultPref('collectionKey', '');

    Zotero.BibTeXAutoExport = {
        version: "0.2.0",
        active: true,

        // Expose for the prefs pane script
        helpers: BibTeXAutoExportHelpers,
        i18n: BibTeXAutoExportI18n,

        config: {
            exportPath: Zotero.Prefs.get('extensions.bibtex-auto-export.exportPath') || "",
            exportFormat: Zotero.Prefs.get('extensions.bibtex-auto-export.exportFormat') || "bibtex",
            translatorID: Zotero.Prefs.get('extensions.bibtex-auto-export.translatorID') || '9cb70025-a888-4a29-a210-93ec52da40d4',
            autoExport: Zotero.Prefs.get('extensions.bibtex-auto-export.autoExport') !== false,
            exportDelay: Zotero.Prefs.get('extensions.bibtex-auto-export.exportDelay') || 2000,
            collectionKey: Zotero.Prefs.get('extensions.bibtex-auto-export.collectionKey') || ""
        },

        log: function(message) {
            Zotero.debug("[BibTeXAutoExport] " + message);
            Services.console.logStringMessage("[BibTeXAutoExport] " + message);
        },

        // Re-read prefs from Zotero.Prefs. The prefs pane writes directly
        // to Zotero.Prefs, so the in-memory config can drift; this catches
        // it up before each notifier-driven export.
        refreshConfig: function() {
            this.config.exportPath = Zotero.Prefs.get('extensions.bibtex-auto-export.exportPath') || "";
            this.config.exportFormat = Zotero.Prefs.get('extensions.bibtex-auto-export.exportFormat') || "bibtex";
            this.config.translatorID = Zotero.Prefs.get('extensions.bibtex-auto-export.translatorID') || '9cb70025-a888-4a29-a210-93ec52da40d4';
            this.config.autoExport = Zotero.Prefs.get('extensions.bibtex-auto-export.autoExport') !== false;
            this.config.exportDelay = Zotero.Prefs.get('extensions.bibtex-auto-export.exportDelay') || 2000;
            this.config.collectionKey = Zotero.Prefs.get('extensions.bibtex-auto-export.collectionKey') || "";
        },

        addMenu: function(window) {
            let self = this;
            let doc = window.document;
            let menubar = doc.getElementById('menu_ToolsPopup');
            if (!menubar) return;

            this.removeMenu(window);

            let sep = doc.createXULElement('menuseparator');
            sep.id = 'bibtex-auto-export-sep';
            menubar.appendChild(sep);

            let menu = doc.createXULElement('menu');
            menu.id = 'bibtex-auto-export-menu';
            menu.setAttribute('label', BibTeXAutoExportI18n.t('menu.mainLabel'));

            let popup = doc.createXULElement('menupopup');

            let exportItem = doc.createXULElement('menuitem');
            exportItem.setAttribute('label', BibTeXAutoExportI18n.t('menu.exportNow'));
            exportItem.addEventListener('command', async function() {
                await self.manualExport();
            });
            popup.appendChild(exportItem);

            let prefsItem = doc.createXULElement('menuitem');
            prefsItem.setAttribute('label', BibTeXAutoExportI18n.t('menu.openPreferences'));
            prefsItem.addEventListener('command', function() {
                self.openPreferences();
            });
            popup.appendChild(prefsItem);

            menu.appendChild(popup);
            menubar.appendChild(menu);
        },

        removeMenu: function(window) {
            try {
                let doc = window.document;
                let menu = doc.getElementById('bibtex-auto-export-menu');
                let sep = doc.getElementById('bibtex-auto-export-sep');
                if (menu) menu.remove();
                if (sep) sep.remove();
            } catch (e) {
                this.log("Error removing menu: " + e.message);
            }
        },

        openPreferences: function() {
            try {
                if (prefsPaneID) {
                    Zotero.Utilities.Internal.openPreferences(prefsPaneID);
                } else {
                    Zotero.Utilities.Internal.openPreferences();
                }
            } catch (e) {
                this.log("Could not open preferences: " + e.message);
            }
        },

        registerExportListener: function() {
            let self = this;
            this.notifierID = Zotero.Notifier.registerObserver({
                notify: async function(event, type, ids, extraData) {
                    self.refreshConfig();
                    if (type === 'item' && event === 'add' && self.config.autoExport) {
                        self.log("New items detected: " + ids.length);
                        await Zotero.Promise.delay(self.config.exportDelay);
                        await self.exportLibrary();
                    }
                }
            }, ['item']);
            this.log("Export listener registered");
        },

        exportLibrary: async function() {
            try {
                this.refreshConfig();
                this.log("Starting export...");

                if (!this.config.exportPath) {
                    this.log("No export path configured — opening preferences");
                    this.notifyUser(
                        BibTeXAutoExportI18n.t('notify.pathRequiredTitle'),
                        BibTeXAutoExportI18n.t('notify.pathRequiredBody')
                    );
                    this.openPreferences();
                    return;
                }

                let libraryID = Zotero.Libraries.userLibraryID;
                let items = await this.gatherItems(libraryID);
                items = items.filter(item => item.isRegularItem());

                this.log("Exporting " + items.length + " items with translator: " + this.config.translatorID
                    + (this.config.collectionKey ? " (collection: " + this.config.collectionKey + ")" : " (whole library)"));

                const translation = new Zotero.Translate.Export();
                translation.setItems(items);
                translation.setTranslator(this.config.translatorID);

                let exportString = "";
                translation.setHandler("done", function(obj, success) {
                    if (success) exportString = obj.string;
                });

                await translation.translate();

                if (!exportString) {
                    throw new Error(BibTeXAutoExportI18n.t('error.noContent'));
                }

                await this.saveToFile(exportString);

                this.log("Export successful: " + this.config.exportPath);
                this.notifyUser(
                    BibTeXAutoExportI18n.t('notify.exportCompleteTitle'),
                    BibTeXAutoExportI18n.t('notify.exportComplete', { count: items.length })
                );
            } catch (error) {
                this.log("Export error: " + error.message);
                Services.console.logStringMessage("Export error details: " + error.stack);
                this.notifyUser(BibTeXAutoExportI18n.t('notify.exportFailedTitle'), error.message);
            }
        },

        saveToFile: async function(content) {
            if (!content || content.length === 0) {
                throw new Error(BibTeXAutoExportI18n.t('error.noContentToSave'));
            }

            let timestamp = new Date().toISOString();
            let itemCount = BibTeXAutoExportHelpers.countBibEntries(content);
            let header = BibTeXAutoExportHelpers.buildExportHeader(this.config.exportFormat, timestamp, itemCount);
            let fullContent = header + content;

            let file = Zotero.File.pathToFile(this.config.exportPath);

            if (file.exists()) {
                try {
                    let backupPath = this.config.exportPath + ".backup";
                    let backupFile = Zotero.File.pathToFile(backupPath);
                    if (backupFile.exists()) backupFile.remove(false);
                    file.copyTo(file.parent, file.leafName + ".backup");
                    this.log("Backup created: " + backupPath);
                } catch (e) {
                    this.log("Could not create backup: " + e.message);
                }
            }

            await Zotero.File.putContentsAsync(file, fullContent, "utf-8");
            this.log("File saved: " + this.config.exportPath);
            this.log("Size: " + fullContent.length + " characters");
        },

        // Returns the items to export based on config.collectionKey:
        //  - empty key  → all items in the user library
        //  - valid key  → items in that collection plus all subcollections (deduped)
        //  - stale key  → falls back to whole library and logs a warning
        gatherItems: async function(libraryID) {
            let key = this.config.collectionKey;
            if (!key) {
                return await Zotero.Items.getAll(libraryID, true);
            }

            let collection = Zotero.Collections.getByLibraryAndKey(libraryID, key);
            if (!collection) {
                this.log("Configured collection key not found: " + key + " — falling back to whole library");
                this.notifyUser(
                    BibTeXAutoExportI18n.t('notify.collectionMissingTitle'),
                    BibTeXAutoExportI18n.t('notify.collectionMissingBody')
                );
                return await Zotero.Items.getAll(libraryID, true);
            }

            let seen = new Set();
            let result = [];
            function recurse(coll) {
                let children = coll.getChildItems();
                for (let item of children) {
                    if (!seen.has(item.id)) {
                        seen.add(item.id);
                        result.push(item);
                    }
                }
                let subs = coll.getChildCollections();
                for (let sub of subs) {
                    recurse(sub);
                }
            }
            recurse(collection);
            return result;
        },

        notifyUser: function(title, text) {
            let progressWindow = new Zotero.ProgressWindow();
            progressWindow.changeHeadline(title);
            progressWindow.addLines([text]);
            progressWindow.show();
            progressWindow.startCloseTimer(3000);
        },

        manualExport: async function() {
            this.log("Manual export started...");
            await this.exportLibrary();
        },

        // ----- Preferences pane handlers -----
        // Called from inline `oncommand` attributes in preferences.xhtml.
        // Inline handlers run in the prefs window scope, so we use
        // `event.target.ownerDocument` to find sibling pane elements.

        prefsBrowseExportPath: function(event) {
            let self = this;
            let doc = event.target.ownerDocument;
            let win = doc.defaultView;
            let Cc = Components.classes;
            let Ci = Components.interfaces;

            let title = BibTeXAutoExportI18n.t('prefs.filePicker.title');
            let fp = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
            fp.init(win, title, Ci.nsIFilePicker.modeSave);

            let format = Zotero.Prefs.get('extensions.bibtex-auto-export.exportFormat') || 'bibtex';
            let translators = this._prefsTranslators();
            let ext = (translators[format] || translators.bibtex).extension;
            fp.appendFilter(format + ' files', '*' + ext);
            fp.appendFilter('All Files', '*.*');
            fp.defaultString = 'zotero-export' + ext;

            let currentPath = Zotero.Prefs.get('extensions.bibtex-auto-export.exportPath') || '';
            if (currentPath) {
                try {
                    let currentFile = Zotero.File.pathToFile(currentPath);
                    if (currentFile && currentFile.parent && currentFile.parent.exists()) {
                        fp.displayDirectory = currentFile.parent;
                    }
                } catch (e) { /* ignore */ }
            }

            fp.open(function(result) {
                if (result === Ci.nsIFilePicker.returnOK || result === Ci.nsIFilePicker.returnReplace) {
                    let picked = fp.file.path;
                    Zotero.Prefs.set('extensions.bibtex-auto-export.exportPath', picked);
                    let pathInput = doc.getElementById('bae-export-path');
                    if (pathInput) pathInput.value = picked;
                    self.refreshConfig();
                    self.log("Export path set to: " + picked);
                }
            });
        },

        prefsFormatChanged: function(event) {
            let doc = event.target.ownerDocument;
            let menulist = doc.getElementById('bae-export-format');
            if (!menulist) return;
            let newFormat = menulist.value;
            let translators = this._prefsTranslators();
            let translator = translators[newFormat] || translators.bibtex;

            Zotero.Prefs.set('extensions.bibtex-auto-export.exportFormat', newFormat);
            Zotero.Prefs.set('extensions.bibtex-auto-export.translatorID', translator.id);

            // Update the path extension if a path is set
            let currentPath = Zotero.Prefs.get('extensions.bibtex-auto-export.exportPath') || '';
            if (currentPath) {
                let newPath = BibTeXAutoExportHelpers.replaceExtension(currentPath, translator.extension);
                Zotero.Prefs.set('extensions.bibtex-auto-export.exportPath', newPath);
                let pathInput = doc.getElementById('bae-export-path');
                if (pathInput) pathInput.value = newPath;
            }

            this.refreshConfig();
            this.log("Format changed to: " + newFormat);
        },

        prefsCollectionChanged: function(event) {
            let doc = event.target.ownerDocument;
            let menulist = doc.getElementById('bae-collection');
            if (!menulist) return;
            let key = menulist.value || "";
            Zotero.Prefs.set('extensions.bibtex-auto-export.collectionKey', key);
            this.refreshConfig();
            this.log("Collection filter set to: " + (key || "(whole library)"));
        },

        // Called just before the format menulist popup opens — syncs the
        // menulist's displayed value to whatever is currently in Zotero.Prefs,
        // so reopening the prefs pane shows the correct selection.
        prefsFormatPopupShowing: function(event) {
            let menupopup = event.target;
            let menulist = menupopup.parentNode;
            let current = Zotero.Prefs.get('extensions.bibtex-auto-export.exportFormat') || 'bibtex';
            try {
                menulist.value = current;
            } catch (e) {
                this.log("prefsFormatPopupShowing: could not set value: " + e.message);
            }
        },

        // Called just before the collection menulist popup opens. Rebuilds
        // the menu contents from scratch: "Whole library" entry, separator,
        // then all collections in the user library as a sorted tree indented
        // by depth. Runs synchronously — relies on collections being loaded
        // by the time the user opens the prefs dialog (true in Zotero 7).
        prefsCollectionPopupShowing: function(event) {
            let menupopup = event.target;
            let menulist = menupopup.parentNode;
            let doc = menupopup.ownerDocument;
            let libraryID = Zotero.Libraries.userLibraryID;

            this.log("prefsCollectionPopupShowing: start (library " + libraryID + ")");

            let currentKey = Zotero.Prefs.get('extensions.bibtex-auto-export.collectionKey') || '';

            // Clear existing items
            while (menupopup.firstChild) menupopup.removeChild(menupopup.firstChild);

            // "Whole library" entry
            let firstItem = doc.createXULElement('menuitem');
            firstItem.setAttribute('value', '');
            firstItem.setAttribute('label', BibTeXAutoExportI18n.t('prefs.collection.wholeLibrary'));
            menupopup.appendChild(firstItem);

            // Fetch all collections — try both signatures for robustness
            let allCollections = [];
            try {
                let r1 = Zotero.Collections.getByLibrary(libraryID, true);
                if (Array.isArray(r1) && r1.length > 0) {
                    allCollections = r1;
                    this.log("prefsCollectionPopupShowing: getByLibrary(lib, true) → " + r1.length);
                } else {
                    this.log("prefsCollectionPopupShowing: getByLibrary(lib, true) → "
                        + (Array.isArray(r1) ? "empty array" : typeof r1));
                    // Fallback: non-recursive + manual walk
                    let top = Zotero.Collections.getByLibrary(libraryID);
                    this.log("prefsCollectionPopupShowing: getByLibrary(lib) → "
                        + (Array.isArray(top) ? "array[" + top.length + "]" : typeof top));
                    if (Array.isArray(top)) {
                        let walked = [];
                        let walk = function(c) {
                            walked.push(c);
                            let kids = (typeof c.getChildCollections === 'function')
                                ? c.getChildCollections()
                                : [];
                            for (let i = 0; i < kids.length; i++) walk(kids[i]);
                        };
                        for (let i = 0; i < top.length; i++) walk(top[i]);
                        allCollections = walked;
                    }
                }
            } catch (e) {
                this.log("prefsCollectionPopupShowing: error fetching: " + e.message);
            }

            if (allCollections.length > 0) {
                let sep = doc.createXULElement('menuseparator');
                menupopup.appendChild(sep);

                // Build parent→children tree from parentKey
                let byKey = {};
                for (let i = 0; i < allCollections.length; i++) {
                    byKey[allCollections[i].key] = { coll: allCollections[i], children: [] };
                }
                let roots = [];
                for (let i = 0; i < allCollections.length; i++) {
                    let c = allCollections[i];
                    if (c.parentKey && byKey[c.parentKey]) {
                        byKey[c.parentKey].children.push(byKey[c.key]);
                    } else {
                        roots.push(byKey[c.key]);
                    }
                }

                let sortNodes = function(nodes) {
                    nodes.sort(function(a, b) {
                        return a.coll.name.localeCompare(b.coll.name);
                    });
                    for (let n = 0; n < nodes.length; n++) sortNodes(nodes[n].children);
                };
                sortNodes(roots);

                let addNode = function(node, depth) {
                    let item = doc.createXULElement('menuitem');
                    item.setAttribute('value', node.coll.key);
                    let indent = '';
                    for (let d = 0; d < depth; d++) indent += '    ';
                    item.setAttribute('label', indent + node.coll.name);
                    menupopup.appendChild(item);
                    for (let k = 0; k < node.children.length; k++) {
                        addNode(node.children[k], depth + 1);
                    }
                };
                for (let r = 0; r < roots.length; r++) addNode(roots[r], 0);

                this.log("prefsCollectionPopupShowing: rendered " + allCollections.length + " items");
            } else {
                this.log("prefsCollectionPopupShowing: no collections to render");
            }

            // Restore selection
            try {
                menulist.value = currentKey;
            } catch (e) {
                this.log("prefsCollectionPopupShowing: could not restore value: " + e.message);
            }
        },

        prefsExportNow: async function(event) {
            this.log("prefs: Export Now clicked");
            await this.manualExport();
        },

        // Internal: translator metadata used by the prefs handlers
        _prefsTranslators: function() {
            return {
                bibtex:   { id: '9cb70025-a888-4a29-a210-93ec52da40d4', extension: '.bib' },
                biblatex: { id: 'b6e39b57-8942-4d11-8259-342c46ce395f', extension: '.bib' },
                ris:      { id: '32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7', extension: '.ris' },
                csv:      { id: '25f4c5e2-d790-4daa-a667-797619c7e2f2', extension: '.csv' },
                endnote:  { id: 'eb7059a4-35ec-4961-a915-3cf58eb9784b', extension: '.xml' },
                json:     { id: 'bc03b4fe-436d-4a1f-ba59-de4d2d7a63f7', extension: '.json' }
            };
        }
    };

    // Register the preferences pane (Zotero 7 API).
    try {
        prefsPaneID = await Zotero.PreferencePanes.register({
            pluginID: 'bibtex-auto-export@andriwild.github.io',
            src: rootURI + 'chrome/content/preferences.xhtml',
            label: BibTeXAutoExportI18n.t('prefs.title'),
            image: rootURI + 'chrome/content/icon.svg'
        });
        Zotero.BibTeXAutoExport.log("Preferences pane registered: " + prefsPaneID);
    } catch (e) {
        Services.console.logStringMessage("[BibTeXAutoExport] PreferencePanes.register failed: " + e.message);
    }

    Zotero.BibTeXAutoExport.registerExportListener();
    Zotero.BibTeXAutoExport.log("Auto-Export Plugin initialized");
    Zotero.BibTeXAutoExport.log("Export path: " + (Zotero.BibTeXAutoExport.config.exportPath || "(not set)"));
    Zotero.BibTeXAutoExport.log("Auto-export: " + (Zotero.BibTeXAutoExport.config.autoExport ? "enabled" : "disabled"));

    // Attach menu to any main windows already open when the plugin starts.
    // Windows opened later are handled by onMainWindowLoad (Zotero 7 hook).
    await Zotero.uiReadyPromise;
    for (let win of Zotero.getMainWindows()) {
        if (win.ZoteroPane) {
            try {
                Zotero.BibTeXAutoExport.addMenu(win);
            } catch (error) {
                Services.console.logStringMessage("[BibTeXAutoExport] addMenu error: " + error.message);
            }
        }
    }
}

function onMainWindowLoad({ window }) {
    if (Zotero.BibTeXAutoExport) {
        try {
            Zotero.BibTeXAutoExport.addMenu(window);
        } catch (error) {
            Services.console.logStringMessage("[BibTeXAutoExport] onMainWindowLoad error: " + error.message);
        }
    }
}

function onMainWindowUnload({ window }) {
    if (Zotero.BibTeXAutoExport) {
        try {
            Zotero.BibTeXAutoExport.removeMenu(window);
        } catch (error) {
            Services.console.logStringMessage("[BibTeXAutoExport] onMainWindowUnload error: " + error.message);
        }
    }
}

function shutdown(data, reason) {
    try {
        if (Zotero.BibTeXAutoExport) {
            if (Zotero.BibTeXAutoExport.notifierID) {
                Zotero.Notifier.unregisterObserver(Zotero.BibTeXAutoExport.notifierID);
                Zotero.BibTeXAutoExport.log("Export listener removed");
            }
            for (let win of Zotero.getMainWindows()) {
                Zotero.BibTeXAutoExport.removeMenu(win);
            }
        }
    } catch (error) {
        Services.console.logStringMessage("[BibTeXAutoExport] Shutdown error: " + error.message);
    }
}

function install() {}
function uninstall() {}
