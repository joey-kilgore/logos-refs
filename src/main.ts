/**
 * Logos References Plugin for Obsidian
 * Main plugin entry point and command orchestration
 */

import { Editor, MarkdownEditView, Notice, Plugin, TFile } from 'obsidian';
import { LogosPluginSettingTab } from './settings';
import type { LogosPluginSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { parseLogosClipboard, extractCiteKey } from './utils/clipboard-parser';
import { bibtexToMetadata } from './utils/bibtex-converter';
import { formatInlineCitation } from './utils/citation-formatter';
import {
	createOrUpdateReferenceNote,
	getAllLinksInDocument,
	getBibtexFromLinks,
	updateBibliographyInDocument,
	collectReferencesFromFolder,
	formatBibliographyList
} from './utils/file-manager';

export default class LogosReferencePlugin extends Plugin {
	settings: LogosPluginSettings;
  
	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'paste-logos-reference',
			name: 'Paste Logos reference with BibTeX',
			editorCallback: async (editor: Editor, view: MarkdownEditView) => {
				const file = view.file;
				if (!file) {
					new Notice("No active editor");
					return;
				}
				
				const notePath = file.name
				const clipboard = await navigator.clipboard.readText();
				const { mainText, bibtex, page } = parseLogosClipboard(clipboard);
				const citeKey = extractCiteKey(bibtex);
				const folder = this.settings.bibFolder.trim() || '';
				const filePath = folder ? `${folder}/${citeKey}.md` : `${citeKey}.md`;

				// Format inline citation according to selected format
				const inlineCitation = formatInlineCitation(bibtex, page, this.settings.bibliographyFormat);
		
				// Generate block ID using a persistent counter
				const counters = this.settings.citationCounters;
				if (!counters[notePath]) {
					counters[notePath] = 1;
				} else {
					counters[notePath]++;
				}
				const blockId = `${citeKey.replace(' ','-')}-${counters[notePath]}`;
				await this.saveSettings();
		
				const quotedText = [
					`> [!${this.settings.citationCalloutType}]`,
					`> ${mainText.split('\n').join('\n> ')}`,
					`> [[${filePath}|${inlineCitation}]] ^${blockId}`
				].join('\n');
		
				editor.replaceSelection(`${quotedText}\n`);
		
				// Create or update reference file
				const linkBack = `[[${file.basename}#^${blockId}]]${page ? ` → p. ${page}` : ''}`;
				
				try {
					await createOrUpdateReferenceNote(this.app, filePath, folder, bibtex, linkBack);
					new Notice(`Reference note updated: ${filePath}`);
				} catch (error) {
					new Notice(`Error creating reference note: ${error.message}`);
				}
			}
		});

		this.addCommand({
			id: 'list-bibtex-references',
			name: 'List all BibTeX references',
			editorCallback: async (editor: Editor, view: MarkdownEditView) => {
				const filePath = view.file.path;
				if (!filePath) {
					new Notice("No active file");
					return;
				}
		
				// Step 1: Get all the links in the current document
				const links = await getAllLinksInDocument(this.app, filePath);
				if (links.length === 0) {
					new Notice("No references found in the document.");
					return;
				}

				// Step 2: Get BibTeX from all the linked notes
				const bibtexReferences = await getBibtexFromLinks(this.app, links);
				if (bibtexReferences.length === 0) {
					new Notice("No BibTeX references found in linked notes.");
					return;
				}
		
				// Step 3: Format bibliography entries according to selected format
				const bibliographyList = formatBibliographyList(
					bibtexReferences,
					this.settings.bibliographyFormat
				);
			
				const activeFile = this.app.workspace.getActiveFile();

				if (activeFile instanceof TFile) {
					await updateBibliographyInDocument(this.app, activeFile, bibliographyList);
					new Notice("Bibliography updated.");
				} else {
					new Notice("Could not read active file: not a valid file.");
					return;
				}
			}
		});

		this.addCommand({
			id: 'export-all-references',
			name: 'Export all references to BibTeX file',
			callback: async () => {
				const folder = this.settings.bibFolder.trim() || '';
				
				try {
					const bibtexEntries = await collectReferencesFromFolder(this.app, folder);

					if (bibtexEntries.length === 0) {
						new Notice("No BibTeX references found in the reference folder.");
						return;
					}

					const exportContent = bibtexEntries.join('\n\n');
					const exportPath = 'exported-references.bib';
					
					const existingFile = this.app.vault.getAbstractFileByPath(exportPath);
					if (existingFile instanceof TFile) {
						await this.app.vault.modify(existingFile, exportContent);
						new Notice(`Updated ${exportPath} with ${bibtexEntries.length} references.`);
					} else {
						await this.app.vault.create(exportPath, exportContent);
						new Notice(`Created ${exportPath} with ${bibtexEntries.length} references.`);
					}
				} catch (error) {
					new Notice(`Error exporting references: ${error.message}`);
				}
			}
		});

	  	this.addSettingTab(new LogosPluginSettingTab(this.app, this));
	}
  
	async loadSettings() {
	  	this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
  
	async saveSettings() {
	  	await this.saveData(this.settings);
	}
}
