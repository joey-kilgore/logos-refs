import { App, Editor, MarkdownEditView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { FolderSuggest } from 'autocomplete'

type BibliographyFormat = 'latex' | 'mla';

interface LogosPluginSettings {
	bibFolder: string;
	citationCounters: Record<string, number>;
	bibliographyFormat: BibliographyFormat;
}

const DEFAULT_SETTINGS: LogosPluginSettings = {
	bibFolder: '', // default to vault root
	citationCounters: {},
	bibliographyFormat: 'latex',
};

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

				const pageLabel = page
					? `, ${page.includes('-') || page.includes('–') ? 'pp.' : 'p.'} ${page}`
					: "";
		
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
					`> [!Logos Ref]`,
					`> ${mainText.split('\n').join('\n> ')}`,
					`> [[${filePath}|${citeKey}${pageLabel}]] ^${blockId}`
				].join('\n');
		
				editor.replaceSelection(`${quotedText}\n`);
		
				// Check if reference file exists
				const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
				const abstractFileFolder = this.app.vault.getAbstractFileByPath(folder)
				const linkBack = `[[${file.basename}#^${blockId}]]${page ? ` → p. ${page}` : ''}`;
				
				if (!abstractFile) {
					if (folder && (!abstractFileFolder || !(abstractFileFolder instanceof TFolder))) {
						// if a folder was provided and either
						//   there is no folder, or the folder is not an instance of a folder
						// then we need to create the folder
						await this.app.vault.createFolder(folder);
					}
					const content = [
						'```bibtex',
						bibtex.replace(/pages\s*=\s*{[^}]*},?\s*/gi, ""),  // optionally remove page field
						'```',
						'',
						'## Citations',
						`- ${linkBack}`
					].join('\n');
					await this.app.vault.create(filePath, content);
					new Notice(`Created ${filePath}`);
				} else {
					let refNote = '';
					if (abstractFile instanceof TFile) {
						refNote = await this.app.vault.read(abstractFile);
					} else {
						new Notice(`Could not read ${filePath}: not a valid file`);
						return;
					}
					const citationLine = `- ${linkBack}`;
					let updatedContent: string;
		
					if (refNote.includes("## Citations")) {
						updatedContent = refNote.replace(
							/## Citations([\s\S]*?)((\n#+\s)|$)/,
							(match, citations, followingHeading) => {
								if (!match.includes(linkBack)) {
									return `## Citations\n${citations.trim()}\n${citationLine}\n${followingHeading}`;
								}
								return match; // don't add if it already exists
							}
						);
					} else {
						updatedContent = `${refNote.trim()}\n\n## Citations\n${citationLine}`;
					}

					if (abstractFile instanceof TFile) {
						await this.app.vault.modify(abstractFile, updatedContent);
					}
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
		
				// Step 1: Get all the links in the current document (reference to other notes)
				const links = await this.getAllLinksInDocument(filePath);
				if (links.length === 0) {
					new Notice("No references found in the document.");
					return;
				}
				// Step 2: Get BibTeX from all the linked notes
				const bibtexReferences = await this.getBibtexFromLinks(links);
				if (bibtexReferences.length === 0) {
					new Notice("No BibTeX references found in linked notes.");
					return;
				}
		
				// Step 3: Format bibliography entries according to selected format
				const format = this.settings.bibliographyFormat;
				const formattedReferences = bibtexReferences.map(bibtex => {
					if (format === 'latex') {
						// For LaTeX, wrap in code block
						return '```bibtex\n' + bibtex + '\n```';
					} else {
						// For MLA, convert and display as plain text
						return formatBibliographyEntry(bibtex, format);
					}
				});
				const bibliographyList = formattedReferences.join("\n\n");
			
				const activeFile = this.app.workspace.getActiveFile();
				let content = '';

				if (activeFile instanceof TFile) {
					content = await this.app.vault.read(activeFile);
					
					// Check if a bibliography already exists and replace it
					const bibliographyRegex = /## Bibliography\n[\s\S]*?(?=\n##\s|\n---(?:\s|$)|$)/;
					let updatedContent: string;
					
					if (bibliographyRegex.test(content)) {
						// Replace existing bibliography, preserving spacing before next section
						updatedContent = content.replace(bibliographyRegex, `## Bibliography\n${bibliographyList}\n`);
						new Notice("Bibliography updated.");
					} else {
						// Add new bibliography at the end
						updatedContent = `${content}\n\n## Bibliography\n${bibliographyList}`;
						new Notice("Bibliography added to the document.");
					}
					
					await this.app.vault.modify(activeFile, updatedContent);
				} else {
					new Notice("Could not read active file: not a valid file.");
					return;
				}
			}
		});
		
	  	this.addSettingTab(new LogosPluginSettingTab(this.app, this));
	}

	// Helper function to get all links in a document
	async getAllLinksInDocument(filePath: string): Promise<string[]> {
		const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
		if (!(abstractFile instanceof TFile)) return [];
	
		const cache = this.app.metadataCache.getFileCache(abstractFile);
		if (!cache || !cache.links) return [];
	
		// Extract just the link target (removing any alias), and remove duplicates
		const uniqueLinks = Array.from(new Set(cache.links.map(link => link.link)));
		return uniqueLinks;
	}
	
	// Helper function to get BibTeX from the links
	async getBibtexFromLinks(links: string[]): Promise<string[]> {
		const bibtexReferences: string[] = [];
		for (const link of links) {
			const file = this.app.vault.getAbstractFileByPath(link);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				// Updated regex to match BibTeX block
				const bibtexMatch = content.match(/```bibtex[\s\S]*?```/);

				if (bibtexMatch) {
					// Extract the content between the '```bibtex' and '```' markers
					const bibtexContent = bibtexMatch[0].replace(/```bibtex|```/g, '').trim();
					bibtexReferences.push(bibtexContent);
				}
			}
		}
		return bibtexReferences;
	}
  
	async loadSettings() {
	  	this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
  
	async saveSettings() {
	  	await this.saveData(this.settings);
	}
}

function parseLogosClipboard(clipboard: string): {
	mainText: string;
	bibtex: string;
	page: string | null;
} {
	const parts = clipboard.split(/\n(?=@)/); // Split before the bibtex
	const mainText = parts[0].trim();
	let bibtex = parts[1]?.trim() || "";
  
	// Extract page number BEFORE modifying bibtex
	const pageMatch = bibtex.match(/pages\s*=\s*\{([^}]+)\}/i);
	const page = pageMatch ? pageMatch[1] : null;
  
	// Clean up bibtex (remove pages field)
	bibtex = bibtex.replace(/pages\s*=\s*\{[^}]*\},?\s*\n?/gi, "");
  
	return { mainText, bibtex, page };
}

function extractCiteKey(bibtex: string): string {
	const match = bibtex.match(/^@\w+\{([^,]+),/);
	if (!match) throw new Error("Could not extract cite key");

	let citeKey = match[1];
	citeKey = citeKey.replace(/[_\W]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	return citeKey;
}

function extractPageNumber(text: string): { cleanedText: string, page: string | null } {
	const pageRegex = /[\(\[]?(p{1,2}\.? ?\d+([–-]\d+)?)[\)\]]?\.?$/i;
	const match = text.match(pageRegex);
	if (match) {
		const page = match[1];
		const cleanedText = text.replace(pageRegex, "").trim();
		return { cleanedText, page };
	}
	return { cleanedText: text.trim(), page: null };
}

function extractPagesFromBibtex(bibtex: string): string | null {
	const match = bibtex.match(/pages\s*=\s*[{"]([^}"]+)[}"]/i);
	return match ? match[1] : null;
}

function formatBibliographyEntry(bibtex: string, format: BibliographyFormat): string {
	if (format === 'latex') {
		// Return original BibTeX format
		return bibtex;
	} else if (format === 'mla') {
		// Convert BibTeX to MLA format
		return convertBibtexToMLA(bibtex);
	}
	return bibtex;
}

function convertBibtexToMLA(bibtex: string): string {
	try {
		// Extract BibTeX entry type
		const typeMatch = bibtex.match(/^@(\w+)\{/);
		const entryType = typeMatch ? typeMatch[1].toLowerCase() : 'misc';
		
		// Extract fields from BibTeX
		const extractField = (field: string): string | null => {
			const regex = new RegExp(`${field}\\s*=\\s*[{"]([^}"]+)[}"]`, 'i');
			const match = bibtex.match(regex);
			return match ? match[1].trim() : null;
		};
		
		const author = extractField('author');
		const title = extractField('title');
		const year = extractField('year');
		const publisher = extractField('publisher');
		const journal = extractField('journal');
		const volume = extractField('volume');
		const number = extractField('number');
		const pages = extractField('pages');
		const address = extractField('address');
		const edition = extractField('edition');
		const booktitle = extractField('booktitle');
		const editor = extractField('editor');
		
		let mlaEntry = '';
		
		// Format author names (convert "Last, First" to "Last, First.")
		let formattedAuthor = '';
		if (author) {
			const authors = author.split(' and ');
			if (authors.length === 1) {
				formattedAuthor = author;
			} else if (authors.length === 2) {
				formattedAuthor = `${authors[0]}, and ${authors[1]}`;
			} else {
				formattedAuthor = `${authors[0]}, et al.`;
			}
		}
		
		// Build MLA citation based on entry type
		if (entryType === 'book') {
			if (formattedAuthor) mlaEntry += formattedAuthor + '. ';
			if (title) mlaEntry += `*${title}*. `;
			if (edition) mlaEntry += `${edition} ed. `;
			// Publisher and location
			const pubParts = [];
			if (publisher) pubParts.push(publisher);
			if (address) pubParts.push(address);
			if (pubParts.length > 0) mlaEntry += pubParts.join(', ');
			if (year) {
				if (pubParts.length > 0) mlaEntry += ', ';
				mlaEntry += year;
			}
			if (pubParts.length > 0 || year) mlaEntry += '.';
		} else if (entryType === 'article') {
			if (formattedAuthor) mlaEntry += formattedAuthor + '. ';
			if (title) mlaEntry += `"${title}." `;
			if (journal) {
				mlaEntry += `*${journal}*`;
				// Add volume, number, year, pages as a sequence
				const details = [];
				if (volume) details.push(`vol. ${volume}`);
				if (number) details.push(`no. ${number}`);
				if (year) details.push(year);
				if (pages) details.push(`pp. ${pages}`);
				if (details.length > 0) mlaEntry += ', ' + details.join(', ');
				mlaEntry += '.';
			}
		} else if (entryType === 'incollection' || entryType === 'inbook') {
			if (formattedAuthor) mlaEntry += formattedAuthor + '. ';
			if (title) mlaEntry += `"${title}." `;
			if (booktitle) {
				mlaEntry += `*${booktitle}*`;
				const details = [];
				if (editor) details.push(`edited by ${editor}`);
				if (edition) details.push(`${edition} ed.`);
				if (publisher) details.push(publisher);
				if (address) details.push(address);
				if (year) details.push(year);
				if (pages) details.push(`pp. ${pages}`);
				if (details.length > 0) mlaEntry += ', ' + details.join(', ');
				mlaEntry += '.';
			}
		} else {
			// Generic format for other types
			if (formattedAuthor) mlaEntry += formattedAuthor + '. ';
			if (title) mlaEntry += `*${title}*. `;
			const details = [];
			if (publisher) details.push(publisher);
			if (year) details.push(year);
			if (details.length > 0) mlaEntry += details.join(', ') + '.';
		}
		
		// Clean up double periods and extra spaces
		return mlaEntry.trim().replace(/\.\.+/g, '.').replace(/\s+/g, ' ');
	} catch (error) {
		// If parsing fails, return the original bibtex
		return bibtex;
	}
}

class LogosPluginSettingTab extends PluginSettingTab {
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
					.setValue(this.plugin.settings.bibliographyFormat)
					.onChange(async (value) => {
						this.plugin.settings.bibliographyFormat = value as BibliographyFormat;
						await this.plugin.saveSettings();
					});
			});
	}
}
