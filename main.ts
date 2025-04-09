import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

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
			name: 'Paste Logos Reference with BibTeX',
			callback: async () => {
				const editor = this.app.workspace.activeEditor?.editor;
				const file = this.app.workspace.getActiveFile();
				if (!editor || !file) {
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
				const linkBack = `[[${file.basename}#^${blockId}]]${page ? ` → p. ${page}` : ''}`;
				
				if (!abstractFile) {
					if (folder && !(await this.app.vault.getAbstractFileByPath(folder))) {
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
					const refNote = await this.app.vault.read(abstractFile as TFile);
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
		
					await this.app.vault.modify(abstractFile as TFile, updatedContent);
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
	  containerEl.createEl("h2", { text: "Logos Reference Plugin Settings" });
  
	  new Setting(containerEl)
		.setName("BibTeX Note Folder")
		.setDesc("Folder to save BibTeX reference notes (relative to vault root)")
		.addText(text =>
		  text
			.setPlaceholder("e.g., refs")
			.setValue(this.plugin.settings.bibFolder)
			.onChange(async (value) => {
			  this.plugin.settings.bibFolder = value;
			  await this.plugin.saveSettings();
			})
		);
	}
}