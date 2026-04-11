var rootURI;
var prefsPaneID;

if (typeof Zotero !== 'undefined') {
    Zotero.AutoExport = {};
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
        Services.console.logStringMessage("[AutoExport] Failed to load messages: " + e.message);
    }
    AutoExportI18n.init(messages);

    // One-time pref migration from the v0.3.x namespace
    // (`extensions.bibtex-auto-export.*`) to the v0.4.0 namespace
    // (`extensions.auto-export.*`). Runs every startup but is a no-op once
    // the new-namespace prefs exist. Old prefs are left in place so a
    // downgrade still works.
    let MIGRATION_KEYS = [
        'exportPath', 'exportFormat', 'translatorID',
        'autoExport', 'exportDelay', 'collectionKey'
    ];
    let migratedAny = false;
    for (let key of MIGRATION_KEYS) {
        let newVal = Zotero.Prefs.get('extensions.auto-export.' + key);
        if (newVal === undefined || newVal === null || newVal === '') {
            let oldVal = Zotero.Prefs.get('extensions.bibtex-auto-export.' + key);
            if (oldVal !== undefined && oldVal !== null && oldVal !== '') {
                Zotero.Prefs.set('extensions.auto-export.' + key, oldVal);
                migratedAny = true;
            }
        }
    }
    if (migratedAny) {
        Services.console.logStringMessage("[AutoExport] Migrated preferences from extensions.bibtex-auto-export.* to extensions.auto-export.*");
    }

    // Seed first-run defaults so the prefs pane bindings show real values
    // (an unset pref renders as empty / unchecked). Runs after the migration
    // so it fills only the gaps for fresh installs.
    function setDefaultPref(key, value) {
        if (Zotero.Prefs.get('extensions.auto-export.' + key) === undefined) {
            Zotero.Prefs.set('extensions.auto-export.' + key, value);
        }
    }
    setDefaultPref('exportFormat', 'bibtex');
    setDefaultPref('translatorID', '9cb70025-a888-4a29-a210-93ec52da40d4');
    setDefaultPref('autoExport', true);
    setDefaultPref('exportDelay', 2000);
    setDefaultPref('collectionKey', '');

    Zotero.AutoExport = {
        version: "0.4.0",
        active: true,

        // Expose for the prefs pane script
        helpers: AutoExportHelpers,
        i18n: AutoExportI18n,

        config: {
            exportPath: Zotero.Prefs.get('extensions.auto-export.exportPath') || "",
            exportFormat: Zotero.Prefs.get('extensions.auto-export.exportFormat') || "bibtex",
            translatorID: Zotero.Prefs.get('extensions.auto-export.translatorID') || '9cb70025-a888-4a29-a210-93ec52da40d4',
            autoExport: Zotero.Prefs.get('extensions.auto-export.autoExport') !== false,
            exportDelay: Zotero.Prefs.get('extensions.auto-export.exportDelay') || 2000,
            collectionKey: Zotero.Prefs.get('extensions.auto-export.collectionKey') || ""
        },

        log: function(message) {
            Zotero.debug("[AutoExport] " + message);
            Services.console.logStringMessage("[AutoExport] " + message);
        },

        // Re-read prefs from Zotero.Prefs. The prefs pane writes directly
        // to Zotero.Prefs, so the in-memory config can drift; this catches
        // it up before each notifier-driven export.
        refreshConfig: function() {
            this.config.exportPath = Zotero.Prefs.get('extensions.auto-export.exportPath') || "";
            this.config.exportFormat = Zotero.Prefs.get('extensions.auto-export.exportFormat') || "bibtex";
            this.config.translatorID = Zotero.Prefs.get('extensions.auto-export.translatorID') || '9cb70025-a888-4a29-a210-93ec52da40d4';
            this.config.autoExport = Zotero.Prefs.get('extensions.auto-export.autoExport') !== false;
            this.config.exportDelay = Zotero.Prefs.get('extensions.auto-export.exportDelay') || 2000;
            this.config.collectionKey = Zotero.Prefs.get('extensions.auto-export.collectionKey') || "";
        },

        addMenu: function(window) {
            let self = this;
            let doc = window.document;
            let menubar = doc.getElementById('menu_ToolsPopup');
            if (!menubar) return;

            this.removeMenu(window);

            let sep = doc.createXULElement('menuseparator');
            sep.id = 'auto-export-sep';
            menubar.appendChild(sep);

            let menu = doc.createXULElement('menu');
            menu.id = 'auto-export-menu';
            menu.setAttribute('label', AutoExportI18n.t('menu.mainLabel'));

            let popup = doc.createXULElement('menupopup');

            let exportItem = doc.createXULElement('menuitem');
            exportItem.setAttribute('label', AutoExportI18n.t('menu.exportNow'));
            exportItem.addEventListener('command', async function() {
                await self.manualExport();
            });
            popup.appendChild(exportItem);

            let prefsItem = doc.createXULElement('menuitem');
            prefsItem.setAttribute('label', AutoExportI18n.t('menu.openPreferences'));
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
                let menu = doc.getElementById('auto-export-menu');
                let sep = doc.getElementById('auto-export-sep');
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

        // Classic debounce: a single setTimeout-based timer that gets
        // cancelled and replaced on every new notifier event. Only the
        // LAST event in a burst actually fires the export. The 500ms
        // minimum ensures that notifier event bursts (item add +
        // collection-item add + attachment events for one user action)
        // get collapsed into one export.
        _debounceTimer: null,        // numeric timer ID returned by setTimeout
        _debounceWindow: null,       // window where the timer was created
        _exportInProgress: false,    // true while exportLibrary is running
        DEBOUNCE_MIN_MS: 500,

        registerExportListener: function() {
            let self = this;
            this.notifierID = Zotero.Notifier.registerObserver({
                notify: function(event, type, ids, extraData) {
                    if (event !== 'add') return;
                    self.refreshConfig();
                    if (!self.config.autoExport) return;

                    if (!self._shouldExportFor(type, ids)) {
                        self.log("Auto-export skipped (type=" + type + ", " + ids.length + " id(s)) — not in configured collection subtree");
                        return;
                    }

                    self.log("Auto-export trigger (type=" + type + ", " + ids.length + " id(s))");
                    self._scheduleExport();
                }
            }, ['item', 'collection-item']);
            this.log("Export listener registered (item + collection-item)");
        },

        // Cancel any pending debounce timer and schedule a new one. Each
        // call replaces the previous schedule, so a burst of N notifier
        // events results in exactly ONE export, fired after the debounce
        // window has elapsed since the LAST event.
        _scheduleExport: function() {
            let self = this;

            // Cancel any pending timer
            if (self._debounceTimer !== null && self._debounceWindow) {
                try {
                    self._debounceWindow.clearTimeout(self._debounceTimer);
                } catch (e) { /* window may have closed */ }
                self._debounceTimer = null;
            }

            // Resolve effective delay
            let configuredDelay = parseInt(self.config.exportDelay, 10);
            if (isNaN(configuredDelay) || configuredDelay < 0) configuredDelay = 0;
            let effectiveDelay = Math.max(configuredDelay, self.DEBOUNCE_MIN_MS);

            // Need a window for setTimeout. The notifier fires in response
            // to user actions in the UI, so a main window is virtually
            // always present.
            let win = Zotero.getMainWindow();
            if (!win) {
                self.log("No main window for setTimeout — running export immediately");
                self.exportLibrary();
                return;
            }

            self._debounceWindow = win;
            self._debounceTimer = win.setTimeout(function() {
                self._debounceTimer = null;
                self._debounceWindow = null;

                // If a previous export is still running, postpone — don't
                // run two exports in parallel (file write conflict).
                if (self._exportInProgress) {
                    self.log("Export already in progress — re-queuing after current run");
                    self._scheduleExport();
                    return;
                }

                self._exportInProgress = true;
                self.log("Running auto-export (" + effectiveDelay + "ms after last trigger)");
                Promise.resolve(self.exportLibrary()).finally(function() {
                    self._exportInProgress = false;
                });
            }, effectiveDelay);
        },

        // Decide whether a notifier event should trigger an auto-export.
        //  - No collection filter → fire on 'item' adds only (collection-item
        //    is redundant, would double-fire).
        //  - Collection filter set → fire on 'item' adds where the new item
        //    is already in the configured subtree, OR on 'collection-item'
        //    adds whose collection is in the subtree (catches drag-into and
        //    deferred collection assignments from web imports).
        _shouldExportFor: function(type, ids) {
            if (!this.config.collectionKey) {
                return type === 'item';
            }

            let allowed = this._getAllowedCollectionIDs();
            if (allowed.size === 0) {
                // Stale collection key — behave as if no filter is set
                return type === 'item';
            }

            if (type === 'item') {
                let items = Zotero.Items.get(ids);
                if (!Array.isArray(items)) items = [items];
                for (let item of items) {
                    if (!item || typeof item.getCollections !== 'function') continue;
                    let collIDs = item.getCollections();
                    for (let cid of collIDs) {
                        if (allowed.has(cid)) return true;
                    }
                }
                return false;
            }

            if (type === 'collection-item') {
                for (let id of ids) {
                    let collID = AutoExportHelpers.parseCollectionItemNotifierID(id);
                    if (collID !== null && allowed.has(collID)) return true;
                }
                return false;
            }

            return false;
        },

        exportLibrary: async function() {
            try {
                this.refreshConfig();
                this.log("Starting export...");

                if (!this.config.exportPath) {
                    this.log("No export path configured — opening preferences");
                    this.notifyUser(
                        AutoExportI18n.t('notify.pathRequiredTitle'),
                        AutoExportI18n.t('notify.pathRequiredBody')
                    );
                    this.openPreferences();
                    return;
                }

                let libraryID = Zotero.Libraries.userLibraryID;
                let rawItems = await this.gatherItems(libraryID);
                let items = rawItems.filter(function(item) {
                    return item && typeof item.isRegularItem === 'function' && item.isRegularItem();
                });
                const itemCount = items.length;

                this.log("Exporting " + itemCount + " of " + (rawItems ? rawItems.length : 0)
                    + " gathered items, translator: " + this.config.translatorID
                    + (this.config.collectionKey ? " (collection: " + this.config.collectionKey + ")" : " (whole library)"));

                if (itemCount === 0) {
                    this.log("Nothing to export — file untouched, no notification");
                    return;
                }

                const translation = new Zotero.Translate.Export();
                translation.setItems(items);
                translation.setTranslator(this.config.translatorID);

                let exportString = "";
                translation.setHandler("done", function(obj, success) {
                    if (success) exportString = obj.string;
                });

                await translation.translate();

                if (!exportString) {
                    throw new Error(AutoExportI18n.t('error.noContent'));
                }

                await this.saveToFile(exportString);

                this.log("Export successful: " + this.config.exportPath + " (" + itemCount + " entries)");
                this.notifyUser(
                    AutoExportI18n.t('notify.exportCompleteTitle'),
                    AutoExportI18n.t('notify.exportComplete', { count: itemCount })
                );
            } catch (error) {
                this.log("Export error: " + error.message);
                Services.console.logStringMessage("Export error details: " + error.stack);
                this.notifyUser(AutoExportI18n.t('notify.exportFailedTitle'), error.message);
            }
        },

        saveToFile: async function(content) {
            if (!content || content.length === 0) {
                throw new Error(AutoExportI18n.t('error.noContentToSave'));
            }

            let timestamp = new Date().toISOString();
            let itemCount = AutoExportHelpers.countBibEntries(content);
            let header = AutoExportHelpers.buildExportHeader(this.config.exportFormat, timestamp, itemCount);
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
                    AutoExportI18n.t('notify.collectionMissingTitle'),
                    AutoExportI18n.t('notify.collectionMissingBody')
                );
                return await Zotero.Items.getAll(libraryID, true);
            }

            // Collect IDs first (cheap), then load full Item objects via
            // getAsync. Going via IDs (rather than Item objects from
            // getChildItems()) guarantees the items are fully data-loaded —
            // otherwise the BibTeX translator renders empty entries.
            let idSet = new Set();
            function recurse(coll) {
                let ids = coll.getChildItems(true);
                for (let id of ids) idSet.add(id);
                let subs = coll.getChildCollections();
                for (let sub of subs) recurse(sub);
            }
            recurse(collection);

            let allIDs = Array.from(idSet);
            this.log("gatherItems: " + allIDs.length + " item ID(s) collected from collection '"
                + collection.name + "' subtree");

            if (allIDs.length === 0) return [];
            return await Zotero.Items.getAsync(allIDs);
        },

        // Returns a Set of collection IDs covering the configured collection
        // and all its descendants. Empty Set if no collection key is set or
        // the key is stale.
        _getAllowedCollectionIDs: function() {
            if (!this.config.collectionKey) return new Set();
            let libraryID = Zotero.Libraries.userLibraryID;
            let collection = Zotero.Collections.getByLibraryAndKey(libraryID, this.config.collectionKey);
            if (!collection) return new Set();
            let result = new Set();
            function recurse(coll) {
                result.add(coll.id);
                let subs = coll.getChildCollections();
                for (let sub of subs) recurse(sub);
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

            let title = AutoExportI18n.t('prefs.filePicker.title');
            let fp = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
            fp.init(win, title, Ci.nsIFilePicker.modeSave);

            let format = Zotero.Prefs.get('extensions.auto-export.exportFormat') || 'bibtex';
            let translators = this._prefsTranslators();
            let ext = (translators[format] || translators.bibtex).extension;
            fp.appendFilter(format + ' files', '*' + ext);
            fp.appendFilter('All Files', '*.*');
            fp.defaultString = 'zotero-export' + ext;

            let currentPath = Zotero.Prefs.get('extensions.auto-export.exportPath') || '';
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
                    Zotero.Prefs.set('extensions.auto-export.exportPath', picked);
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

            Zotero.Prefs.set('extensions.auto-export.exportFormat', newFormat);
            Zotero.Prefs.set('extensions.auto-export.translatorID', translator.id);

            // Update the path extension if a path is set
            let currentPath = Zotero.Prefs.get('extensions.auto-export.exportPath') || '';
            if (currentPath) {
                let newPath = AutoExportHelpers.replaceExtension(currentPath, translator.extension);
                Zotero.Prefs.set('extensions.auto-export.exportPath', newPath);
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
            Zotero.Prefs.set('extensions.auto-export.collectionKey', key);
            this.refreshConfig();
            this.log("Collection filter set to: " + (key || "(whole library)"));
        },

        // Called just before the format menulist popup opens — syncs the
        // menulist's displayed value to whatever is currently in Zotero.Prefs,
        // so reopening the prefs pane shows the correct selection.
        prefsFormatPopupShowing: function(event) {
            let menupopup = event.target;
            let menulist = menupopup.parentNode;
            let current = Zotero.Prefs.get('extensions.auto-export.exportFormat') || 'bibtex';
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

            let currentKey = Zotero.Prefs.get('extensions.auto-export.collectionKey') || '';

            // Clear existing items
            while (menupopup.firstChild) menupopup.removeChild(menupopup.firstChild);

            // "Whole library" entry
            let firstItem = doc.createXULElement('menuitem');
            firstItem.setAttribute('value', '');
            firstItem.setAttribute('label', AutoExportI18n.t('prefs.collection.wholeLibrary'));
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

                let roots = AutoExportHelpers.buildCollectionTree(allCollections);

                let addNode = function(node, depth) {
                    let item = doc.createXULElement('menuitem');
                    item.setAttribute('value', node.item.key);
                    let indent = '';
                    for (let d = 0; d < depth; d++) indent += '    ';
                    item.setAttribute('label', indent + node.item.name);
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
            pluginID: 'auto-export@andriwild.github.io',
            src: rootURI + 'chrome/content/preferences.xhtml',
            label: AutoExportI18n.t('prefs.title'),
            image: rootURI + 'chrome/content/icon.svg'
        });
        Zotero.AutoExport.log("Preferences pane registered: " + prefsPaneID);
    } catch (e) {
        Services.console.logStringMessage("[AutoExport] PreferencePanes.register failed: " + e.message);
    }

    Zotero.AutoExport.registerExportListener();
    Zotero.AutoExport.log("Auto-Export Plugin initialized");
    Zotero.AutoExport.log("Export path: " + (Zotero.AutoExport.config.exportPath || "(not set)"));
    Zotero.AutoExport.log("Auto-export: " + (Zotero.AutoExport.config.autoExport ? "enabled" : "disabled"));

    // Attach menu to any main windows already open when the plugin starts.
    // Windows opened later are handled by onMainWindowLoad (Zotero 7 hook).
    await Zotero.uiReadyPromise;
    for (let win of Zotero.getMainWindows()) {
        if (win.ZoteroPane) {
            try {
                Zotero.AutoExport.addMenu(win);
            } catch (error) {
                Services.console.logStringMessage("[AutoExport] addMenu error: " + error.message);
            }
        }
    }
}

function onMainWindowLoad({ window }) {
    if (Zotero.AutoExport) {
        try {
            Zotero.AutoExport.addMenu(window);
        } catch (error) {
            Services.console.logStringMessage("[AutoExport] onMainWindowLoad error: " + error.message);
        }
    }
}

function onMainWindowUnload({ window }) {
    if (Zotero.AutoExport) {
        try {
            Zotero.AutoExport.removeMenu(window);
        } catch (error) {
            Services.console.logStringMessage("[AutoExport] onMainWindowUnload error: " + error.message);
        }
    }
}

function shutdown(data, reason) {
    try {
        if (Zotero.AutoExport) {
            // Cancel any pending debounced export
            if (Zotero.AutoExport._debounceTimer !== null
                && Zotero.AutoExport._debounceWindow) {
                try {
                    Zotero.AutoExport._debounceWindow.clearTimeout(
                        Zotero.AutoExport._debounceTimer
                    );
                } catch (e) { /* window may have closed */ }
                Zotero.AutoExport._debounceTimer = null;
                Zotero.AutoExport._debounceWindow = null;
            }
            if (Zotero.AutoExport.notifierID) {
                Zotero.Notifier.unregisterObserver(Zotero.AutoExport.notifierID);
                Zotero.AutoExport.log("Export listener removed");
            }
            for (let win of Zotero.getMainWindows()) {
                Zotero.AutoExport.removeMenu(win);
            }
        }
    } catch (error) {
        Services.console.logStringMessage("[AutoExport] Shutdown error: " + error.message);
    }
}

function install() {}
function uninstall() {}
