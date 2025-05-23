import { App, Editor, MarkdownEditView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { FolderSuggest } from 'autocomplete'

interface LogosPluginSettings {
	bibFolder: string;
	citationCounters: Record<string, number>;
}

const DEFAULT_SETTINGS: LogosPluginSettings = {
	bibFolder: '', // default to vault root
	citationCounters: {},
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
		
				// Step 3: Append BibTeX references at the end of the current document
				const bibtexList = bibtexReferences.join("\n\n");
			
				const activeFile = this.app.workspace.getActiveFile();
				let content = '';

				if (activeFile instanceof TFile) {
					content = await this.app.vault.read(activeFile);
					const updatedContent = `${content}\n\n## Bibliography\n${bibtexList}`;
					await this.app.vault.modify(activeFile, updatedContent);
				} else {
					new Notice("Could not read active file: not a valid file.");
					return;
				}
				new Notice("BibTeX references added to the document.");
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
	}
}
