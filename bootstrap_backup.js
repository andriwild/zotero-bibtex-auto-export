if (typeof Zotero !== 'undefined') {
    Zotero.TestPlugin = {};
}

function startup(data, reason) {
    Zotero.TestPlugin = {
        version: "0.1.0",
        active: true,
        
        // Konfiguration
        config: {
            exportPath: "/home/andri/Documents/zotero-export.bib", // Bereits angepasst für dich!
            exportFormat: "bibtex",
            autoExport: true,
            exportDelay: 2000
        },
        
        log: function(message) {
            Zotero.debug("[TestPlugin] " + message);
            Services.console.logStringMessage("[TestPlugin] " + message);
        },
        
        registerExportListener: function() {
            let self = this;
            
            this.notifierID = Zotero.Notifier.registerObserver({
                notify: async function(event, type, ids, extraData) {
                    if (type === 'item' && event === 'add' && self.config.autoExport) {
                        self.log("Neue Items erkannt: " + ids.length);
                        
                        Zotero.getMainWindow().setTimeout(function() {
                            self.exportLibrary();
                        }, self.config.exportDelay);
                    }
                }
            }, ['item']);
            
            this.log("Export-Listener registriert");
        },
        
        // KORRIGIERTE Export-Funktion
        exportLibrary: async function() {
            try {
                this.log("Starte BibTeX Export...");
                
                const translatorIDs = {
                    'bibtex': '9cb70025-a888-4a29-a210-93ec52da40d4',
                    'biblatex': 'b6e39b57-8942-4d11-8259-342c46ce395f'
                };
                
                const translatorID = translatorIDs[this.config.exportFormat] || translatorIDs['bibtex'];
                
                // Hole alle Items
                let libraryID = Zotero.Libraries.userLibraryID;
                let items = await Zotero.Items.getAll(libraryID, true);
                items = items.filter(item => item.isRegularItem());
                
                this.log("Exportiere " + items.length + " Items...");
                
                // Translator setup - KORRIGIERT
                const translation = new Zotero.Translate.Export();
                translation.setItems(items);
                translation.setTranslator(translatorID);
                
                // String für Export vorbereiten
                let exportString = "";
                
                // Handler für den Export-String
                translation.setHandler("done", function(obj, success) {
                    if (success) {
                        exportString = obj.string;
                    }
                });
                
                // Export durchführen und warten
                await translation.translate();
                
                // Prüfen ob Export erfolgreich
                if (!exportString) {
                    throw new Error("Export hat keinen Inhalt erzeugt");
                }
                
                // In Datei schreiben
                await this.saveToFile(exportString);
                
                this.log("Export erfolgreich: " + this.config.exportPath);
                
                if (this.showNotification) {
                    this.notifyUser("BibTeX exportiert", items.length + " Einträge");
                }
                
            } catch (error) {
                this.log("Export-Fehler: " + error.message);
                Services.console.logStringMessage("Export-Fehler Details: " + error.stack);
            }
        },
        
        // KORRIGIERTE saveToFile Funktion
        saveToFile: async function(content) {
            try {
                if (!content || content.length === 0) {
                    throw new Error("Kein Inhalt zum Speichern");
                }
                
                // Zeitstempel
                let timestamp = new Date().toISOString();
                let itemCount = (content.match(/@/g) || []).length;
                let header = "% Automatisch exportiert: " + timestamp + "\n";
                header += "% Anzahl Einträge: " + itemCount + "\n\n";
                
                let fullContent = header + content;
                
                // Datei-Objekt erstellen
                let file = Zotero.File.pathToFile(this.config.exportPath);
                
                // Backup wenn Datei existiert
                if (file.exists()) {
                    let backupPath = this.config.exportPath + ".backup";
                    file.copyTo(null, backupPath.split('/').pop());
                    this.log("Backup erstellt: " + backupPath);
                }
                
                // Inhalt schreiben - KORRIGIERT
                await Zotero.File.putContentsAsync(file, fullContent, "utf-8");
                
                this.log("Datei gespeichert: " + this.config.exportPath);
                this.log("Größe: " + fullContent.length + " Zeichen");
                
            } catch (error) {
                this.log("Fehler beim Speichern: " + error.message);
                throw error;
            }
        },
        
        showNotification: true,
        notifyUser: function(title, text) {
            let win = Zotero.getMainWindow();
            let progressWindow = new Zotero.ProgressWindow();
            progressWindow.changeHeadline(title);
            progressWindow.addLines([text]);
            progressWindow.show();
            progressWindow.startCloseTimer(3000);
        },
        
        manualExport: async function() {
            this.log("Manueller Export gestartet...");
            await this.exportLibrary();
            return "Export abgeschlossen";
        },
        
        setExportPath: function(newPath) {
            this.config.exportPath = newPath;
            this.log("Export-Pfad geändert zu: " + newPath);
            return "Pfad gesetzt: " + newPath;
        },
        
        setFormat: function(format) {
            if (format === 'bibtex' || format === 'biblatex') {
                this.config.exportFormat = format;
                this.log("Format geändert zu: " + format);
                return "Format: " + format;
            }
            return "Ungültiges Format. Nutze 'bibtex' oder 'biblatex'";
        },
        
        toggleAutoExport: function() {
            this.config.autoExport = !this.config.autoExport;
            this.log("Auto-Export: " + (this.config.autoExport ? "AN" : "AUS"));
            return "Auto-Export ist " + (this.config.autoExport ? "aktiviert" : "deaktiviert");
        }
    };
    
    // Initialisierung
    Zotero.getMainWindow().setTimeout(function() {
        try {
            Zotero.TestPlugin.registerExportListener();
            Zotero.TestPlugin.log("Auto-Export Plugin initialisiert");
            Zotero.TestPlugin.log("Export-Pfad: " + Zotero.TestPlugin.config.exportPath);
        } catch (error) {
            Services.console.logStringMessage("[TestPlugin] Init-Fehler: " + error.message);
        }
    }, 1000);
}

function shutdown(data, reason) {
    try {
        if (Zotero.TestPlugin && Zotero.TestPlugin.notifierID) {
            Zotero.Notifier.unregisterObserver(Zotero.TestPlugin.notifierID);
            Zotero.TestPlugin.log("Export-Listener entfernt");
        }
    } catch (error) {
        Services.console.logStringMessage("[TestPlugin] Shutdown-Fehler: " + error.message);
    }
}

function install() {}
function uninstall() {}
