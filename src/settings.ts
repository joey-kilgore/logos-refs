/**
 * Settings interface and settings tab for the Logos References plugin
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type LogosReferencePlugin from './main';
import { FolderSuggest } from './ui/folder-suggest';
import type { BibliographyFormat } from './types';

export class LogosPluginSettingTab extends PluginSettingTab {
	plugin: LogosReferencePlugin;
  
	constructor(app: App, plugin: LogosReferencePlugin) {
	  super(app, plugin);
	  this.plugin = plugin;
	}
  
	display(): void {
		const { containerEl } = this;
	
		containerEl.empty();

		new Setting(this.containerEl)
            .setName("BibTeX note folder")
            .setDesc("Folder to save BibTeX reference notes")
            .addSearch((text) => {
                new FolderSuggest(this.app, text.inputEl);
                text.setPlaceholder("Example: folder1/folder2")
                    .setValue(this.plugin.settings.bibFolder)
                    .onChange(async (new_folder) => {
                        // Trim folder and Strip ending slash if there
                        new_folder = new_folder.trim()
                        new_folder = new_folder.replace(/\/$/, "");

                        this.plugin.settings.bibFolder = new_folder;
                        await this.plugin.saveSettings();
                    });
                // @ts-ignore
                text.containerEl.addClass("BibTeX_search");
            });

		new Setting(this.containerEl)
			.setName("Bibliography format")
			.setDesc("Format for the generated bibliography")
			.addDropdown((dropdown) => {
				dropdown
					.addOption('latex', 'LaTeX (BibTeX)')
					.addOption('mla', 'MLA')
					.addOption('apa', 'APA')
					.addOption('chicago', 'Chicago')
					.setValue(this.plugin.settings.bibliographyFormat)
					.onChange(async (value) => {
						this.plugin.settings.bibliographyFormat = value as BibliographyFormat;
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.containerEl)
			.setName("Citation callout type")
			.setDesc("Customize the callout type for citations (e.g., 'Logos Ref', 'Quote', 'Citation')")
			.addText((text) => {
				text
					.setPlaceholder("Logos Ref")
					.setValue(this.plugin.settings.citationCalloutType)
					.onChange(async (value) => {
						this.plugin.settings.citationCalloutType = value || 'Logos Ref';
						await this.plugin.saveSettings();
					});
			});
	}
}
