if (typeof Zotero !== 'undefined') {
    Zotero.TestPlugin = {};
}

function startup(data, reason) {
    let rootURI = data.rootURI || (data.resourceURI && data.resourceURI.spec);
    Services.scriptloader.loadSubScript(rootURI + "chrome/content/helpers.js");

    Zotero.TestPlugin = {
        version: "0.1.0",
        active: true,
        
        // Configuration with more export formats
        config: {
            exportPath: Zotero.Prefs.get('extensions.testplugin.exportPath') || "",
            exportFormat: Zotero.Prefs.get('extensions.testplugin.exportFormat') || "bibtex",
            translatorID: Zotero.Prefs.get('extensions.testplugin.translatorID') || '9cb70025-a888-4a29-a210-93ec52da40d4',
            autoExport: Zotero.Prefs.get('extensions.testplugin.autoExport') !== false,
            exportDelay: Zotero.Prefs.get('extensions.testplugin.exportDelay') || 2000
        },
        
        // Available export translators
        translators: {
            'bibtex': {
                id: '9cb70025-a888-4a29-a210-93ec52da40d4',
                label: 'BibTeX',
                extension: '.bib'
            },
            'biblatex': {
                id: 'b6e39b57-8942-4d11-8259-342c46ce395f',
                label: 'BibLaTeX',
                extension: '.bib'
            },
            'ris': {
                id: '32d59d2d-b65a-4da4-b0a3-bdd3cfb979e7',
                label: 'RIS',
                extension: '.ris'
            },
            'csv': {
                id: '25f4c5e2-d790-4daa-a667-797619c7e2f2',
                label: 'CSV',
                extension: '.csv'
            }
        },
        
        log: function(message) {
            Zotero.debug("[TestPlugin] " + message);
            Services.console.logStringMessage("[TestPlugin] " + message);
        },
        
        // Save preferences
        savePrefs: function() {
            Zotero.Prefs.set('extensions.testplugin.exportPath', this.config.exportPath);
            Zotero.Prefs.set('extensions.testplugin.exportFormat', this.config.exportFormat);
            Zotero.Prefs.set('extensions.testplugin.translatorID', this.config.translatorID);
            Zotero.Prefs.set('extensions.testplugin.autoExport', this.config.autoExport);
            Zotero.Prefs.set('extensions.testplugin.exportDelay', this.config.exportDelay);
            this.log("Preferences saved");
        },
        
        // Add menu items to the Tools menu of a given main window
        addMenu: function(window) {
            let self = this;
            let doc = window.document;
            let menubar = doc.getElementById('menu_ToolsPopup');

            if (!menubar) return;

            // Remove existing menu if present (idempotent)
            this.removeMenu(window);
            
            // Add separator
            let sep = doc.createXULElement('menuseparator');
            sep.id = 'testplugin-sep';
            menubar.appendChild(sep);
            
            // Main menu
            let menu = doc.createXULElement('menu');
            menu.id = 'testplugin-menu';
            menu.setAttribute('label', 'BibTeX Auto-Export');
            
            let popup = doc.createXULElement('menupopup');
            
            // Menu item: Export Now
            let exportItem = doc.createXULElement('menuitem');
            exportItem.setAttribute('label', 'Export Now');
            exportItem.addEventListener('command', async function() {
                await self.manualExport();
            });
            popup.appendChild(exportItem);
            
            // Separator
            popup.appendChild(doc.createXULElement('menuseparator'));
            
            // Menu item: Toggle Auto-Export
            let toggleItem = doc.createXULElement('menuitem');
            toggleItem.setAttribute('label', 'Auto-Export');
            toggleItem.setAttribute('type', 'checkbox');
            toggleItem.setAttribute('checked', this.config.autoExport);
            toggleItem.addEventListener('command', function() {
                self.toggleAutoExport();
                toggleItem.setAttribute('checked', self.config.autoExport);
            });
            popup.appendChild(toggleItem);
            
            // Menu item: Change Export Path
            let pathItem = doc.createXULElement('menuitem');
            pathItem.setAttribute('label', 'Change Export Path...');
            pathItem.addEventListener('command', function() {
                self.changeExportPath();
            });
            popup.appendChild(pathItem);
            
            // Menu item: Choose Export Format
            let formatItem = doc.createXULElement('menuitem');
            formatItem.setAttribute('label', 'Choose Export Format...');
            formatItem.addEventListener('command', function() {
                self.chooseExportFormat();
            });
            popup.appendChild(formatItem);
            
            // Separator
            popup.appendChild(doc.createXULElement('menuseparator'));
            
            // Menu item: Show Current Settings
            let infoItem = doc.createXULElement('menuitem');
            infoItem.setAttribute('label', 'Show Current Settings');
            infoItem.addEventListener('command', function() {
                self.showCurrentSettings();
            });
            popup.appendChild(infoItem);
            
            menu.appendChild(popup);
            menubar.appendChild(menu);

            this.log("Menu added");
        },

        removeMenu: function(window) {
            try {
                let doc = window.document;
                let menu = doc.getElementById('testplugin-menu');
                let sep = doc.getElementById('testplugin-sep');
                if (menu) menu.remove();
                if (sep) sep.remove();
            } catch (e) {
                this.log("Error removing menu: " + e.message);
            }
        },
        
        // FIXED: Choose export format using proper array conversion
        chooseExportFormat: async function() {
            let self = this;
            
            try {
                // Get all available export translators
                let translators = await Zotero.Translators.getAllForType('export');
                
                // Filter for bibliography formats
                let bibTranslators = translators.filter(t => {
                    let label = t.label.toLowerCase();
                    return label.includes('bib') || 
                           label.includes('ris') || 
                           label.includes('csv') ||
                           label.includes('endnote') ||
                           label.includes('refer') ||
                           label.includes('json');
                });
                
                if (bibTranslators.length === 0) {
                    // Fallback to built-in list
                    this.simpleFormatSelection();
                    return;
                }
                
                // Create proper string array for prompt service
                let win = Zotero.getMainWindow();
                let items = bibTranslators.map(t => t.label);
                
                // FIXED: Use Zotero's approach with window.prompt as alternative
                let itemsList = items.map((item, index) => `${index + 1}. ${item}`).join('\n');
                let message = "Available export formats:\n\n" + itemsList + "\n\nEnter number (1-" + items.length + "):";
                
                let input = win.prompt(message, "1");

                let index = TestPluginHelpers.parsePromptIndex(input, bibTranslators.length);
                if (index !== null) {
                    let selectedTranslator = bibTranslators[index];

                    this.config.translatorID = selectedTranslator.translatorID;
                    this.config.exportFormat = selectedTranslator.label.toLowerCase().replace(/\s+/g, '');

                    let newExtension = TestPluginHelpers.extensionForTranslatorLabel(selectedTranslator.label);
                    this.config.exportPath = TestPluginHelpers.replaceExtension(this.config.exportPath, newExtension);

                    this.savePrefs();
                    this.log("Export format changed to: " + selectedTranslator.label);

                    this.notifyUser(
                        "Format Changed",
                        "Export format: " + selectedTranslator.label
                    );
                }

            } catch (error) {
                this.log("Error choosing format: " + error.message);
                // Fallback to simple format selection
                this.simpleFormatSelection();
            }
        },
        
        // Simple format selection as fallback - ALSO FIXED
        simpleFormatSelection: function() {
            let self = this;
            let win = Zotero.getMainWindow();
            
            let formats = Object.keys(this.translators).map(key => this.translators[key].label);
            let formatsList = formats.map((item, index) => `${index + 1}. ${item}`).join('\n');
            let currentFormat = TestPluginHelpers.findFormatKeyByTranslatorID(this.translators, this.config.translatorID);
            let currentLabel = currentFormat ? this.translators[currentFormat].label : 'Unknown';

            let message = "Current format: " + currentLabel + "\n\n";
            message += "Available formats:\n" + formatsList + "\n\nEnter number (1-" + formats.length + "):";

            let input = win.prompt(message, "1");

            let keys = Object.keys(this.translators);
            let index = TestPluginHelpers.parsePromptIndex(input, keys.length);
            if (index !== null) {
                let selectedKey = keys[index];
                let selectedTranslator = this.translators[selectedKey];

                this.config.exportFormat = selectedKey;
                this.config.translatorID = selectedTranslator.id;

                this.config.exportPath = TestPluginHelpers.replaceExtension(this.config.exportPath, selectedTranslator.extension);

                this.savePrefs();
                this.log("Format changed to: " + selectedTranslator.label);

                this.notifyUser(
                    "Format Changed",
                    "Export format: " + selectedTranslator.label
                );
            }
        },
        
        // Change export path using file picker
        changeExportPath: function() {
            let self = this;
            let win = Zotero.getMainWindow();
            
            let fp = win.Cc["@mozilla.org/filepicker;1"].createInstance(win.Ci.nsIFilePicker);
            fp.init(win, "Select Export Location", win.Ci.nsIFilePicker.modeSave);
            
            // Add filters based on current format
            if (this.config.exportFormat.includes('bib')) {
                fp.appendFilter("BibTeX Files", "*.bib");
            } else if (this.config.exportFormat.includes('ris')) {
                fp.appendFilter("RIS Files", "*.ris");
            } else if (this.config.exportFormat.includes('csv')) {
                fp.appendFilter("CSV Files", "*.csv");
            } else if (this.config.exportFormat.includes('json')) {
                fp.appendFilter("JSON Files", "*.json");
            }
            fp.appendFilter("All Files", "*.*");
            
            fp.defaultString = "zotero-export" + (this.config.exportPath.match(/\.[^/.]+$/) || ['.bib'])[0];
            
            try {
                let currentFile = Zotero.File.pathToFile(this.config.exportPath);
                if (currentFile && currentFile.parent && currentFile.parent.exists()) {
                    fp.displayDirectory = currentFile.parent;
                }
            } catch (e) {
                this.log("Could not set default directory: " + e.message);
            }
            
            fp.open(function(result) {
                if (result == win.Ci.nsIFilePicker.returnOK || result == win.Ci.nsIFilePicker.returnReplace) {
                    self.config.exportPath = fp.file.path;
                    self.savePrefs();
                    self.log("Export path changed to: " + fp.file.path);
                    
                    self.notifyUser(
                        "Path Updated",
                        "Export path: " + fp.file.leafName
                    );
                }
            });
        },
        
        // Show current settings
        showCurrentSettings: async function() {
            let message = "Current Auto-Export Settings:\n\n";
            message += "Export Path:\n" + this.config.exportPath + "\n\n";
            
            // Get translator name
            try {
                let translator = await Zotero.Translators.get(this.config.translatorID);
                if (translator) {
                    message += "Format: " + translator.label + "\n";
                } else {
                    message += "Format: " + this.config.exportFormat.toUpperCase() + "\n";
                }
            } catch (e) {
                message += "Format: " + this.config.exportFormat.toUpperCase() + "\n";
            }
            
            message += "Auto-Export: " + (this.config.autoExport ? "Enabled" : "Disabled") + "\n";
            message += "Export Delay: " + this.config.exportDelay + "ms\n\n";
            
            try {
                let libraryID = Zotero.Libraries.userLibraryID;
                let items = await Zotero.Items.getAll(libraryID, true);
                let regularItems = items.filter(item => item.isRegularItem());
                message += "Items to export: " + regularItems.length;
            } catch (e) {
                this.log("Could not get library stats: " + e.message);
            }
            
            Zotero.getMainWindow().alert(message);
        },
        
        registerExportListener: function() {
            let self = this;
            
            this.notifierID = Zotero.Notifier.registerObserver({
                notify: async function(event, type, ids, extraData) {
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
                this.log("Starting export...");

                if (!this.config.exportPath) {
                    this.log("No export path configured — prompting user");
                    this.notifyUser("Export Path Required", "Pick a file to export to.");
                    this.changeExportPath();
                    return;
                }

                let libraryID = Zotero.Libraries.userLibraryID;
                let items = await Zotero.Items.getAll(libraryID, true);
                items = items.filter(item => item.isRegularItem());
                
                this.log("Exporting " + items.length + " items with translator: " + this.config.translatorID);
                
                const translation = new Zotero.Translate.Export();
                translation.setItems(items);
                translation.setTranslator(this.config.translatorID);
                
                let exportString = "";
                
                translation.setHandler("done", function(obj, success) {
                    if (success) {
                        exportString = obj.string;
                    }
                });
                
                await translation.translate();
                
                if (!exportString) {
                    throw new Error("Export produced no content");
                }
                
                await this.saveToFile(exportString);
                
                this.log("Export successful: " + this.config.exportPath);
                
                if (this.showNotification) {
                    this.notifyUser("Export Complete", items.length + " entries exported");
                }
                
            } catch (error) {
                this.log("Export error: " + error.message);
                Services.console.logStringMessage("Export error details: " + error.stack);
                this.notifyUser("Export Failed", error.message);
            }
        },
        
        saveToFile: async function(content) {
            try {
                if (!content || content.length === 0) {
                    throw new Error("No content to save");
                }
                
                let timestamp = new Date().toISOString();
                let itemCount = TestPluginHelpers.countBibEntries(content);
                let header = TestPluginHelpers.buildExportHeader(this.config.exportFormat, timestamp, itemCount);

                let fullContent = header + content;
                
                let file = Zotero.File.pathToFile(this.config.exportPath);
                
                // Create backup if file exists
                if (file.exists()) {
                    try {
                        let backupPath = this.config.exportPath + ".backup";
                        let backupFile = Zotero.File.pathToFile(backupPath);
                        
                        if (backupFile.exists()) {
                            backupFile.remove(false);
                        }
                        
                        file.copyTo(file.parent, file.leafName + ".backup");
                        this.log("Backup created: " + backupPath);
                    } catch (e) {
                        this.log("Could not create backup: " + e.message);
                    }
                }
                
                // Write the file
                await Zotero.File.putContentsAsync(file, fullContent, "utf-8");
                
                this.log("File saved: " + this.config.exportPath);
                this.log("Size: " + fullContent.length + " characters");
                
            } catch (error) {
                this.log("Error saving file: " + error.message);
                throw error;
            }
        },
        
        showNotification: true,
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
            return "Export completed";
        },
        
        toggleAutoExport: function() {
            this.config.autoExport = !this.config.autoExport;
            this.savePrefs();
            this.log("Auto-export: " + (this.config.autoExport ? "ON" : "OFF"));
            
            this.notifyUser(
                "Auto-Export " + (this.config.autoExport ? "Enabled" : "Disabled"),
                "Will " + (this.config.autoExport ? "automatically export" : "not export") + " when items are added"
            );
            
            return "Auto-export is " + (this.config.autoExport ? "enabled" : "disabled");
        }
    };
    
    Zotero.TestPlugin.registerExportListener();
    Zotero.TestPlugin.log("Auto-Export Plugin initialized");
    Zotero.TestPlugin.log("Export path: " + (Zotero.TestPlugin.config.exportPath || "(not set)"));
    Zotero.TestPlugin.log("Auto-export: " + (Zotero.TestPlugin.config.autoExport ? "enabled" : "disabled"));

    // Attach menu to any main windows already open when the plugin starts.
    // Windows opened later are handled by onMainWindowLoad (Zotero 7 hook).
    Zotero.uiReadyPromise.then(function() {
        let windows = Zotero.getMainWindows();
        for (let win of windows) {
            if (win.ZoteroPane) {
                try {
                    Zotero.TestPlugin.addMenu(win);
                } catch (error) {
                    Services.console.logStringMessage("[TestPlugin] addMenu error: " + error.message);
                }
            }
        }
    });
}

function onMainWindowLoad({ window }) {
    if (Zotero.TestPlugin) {
        try {
            Zotero.TestPlugin.addMenu(window);
        } catch (error) {
            Services.console.logStringMessage("[TestPlugin] onMainWindowLoad error: " + error.message);
        }
    }
}

function onMainWindowUnload({ window }) {
    if (Zotero.TestPlugin) {
        try {
            Zotero.TestPlugin.removeMenu(window);
        } catch (error) {
            Services.console.logStringMessage("[TestPlugin] onMainWindowUnload error: " + error.message);
        }
    }
}

function shutdown(data, reason) {
    try {
        if (Zotero.TestPlugin) {
            if (Zotero.TestPlugin.notifierID) {
                Zotero.Notifier.unregisterObserver(Zotero.TestPlugin.notifierID);
                Zotero.TestPlugin.log("Export listener removed");
            }
            for (let win of Zotero.getMainWindows()) {
                Zotero.TestPlugin.removeMenu(win);
            }
        }
    } catch (error) {
        Services.console.logStringMessage("[TestPlugin] Shutdown error: " + error.message);
    }
}

function install() {}
function uninstall() {}
