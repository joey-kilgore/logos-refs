import { App, Editor, MarkdownEditView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { FolderSuggest } from 'autocomplete'

type BibliographyFormat = 'latex' | 'mla' | 'apa' | 'chicago';

interface LogosPluginSettings {
	bibFolder: string;
	citationCounters: Record<string, number>;
	bibliographyFormat: BibliographyFormat;
	citationCalloutType: string;
}

const DEFAULT_SETTINGS: LogosPluginSettings = {
	bibFolder: '', // default to vault root
	citationCounters: {},
	bibliographyFormat: 'latex',
	citationCalloutType: 'Logos Ref',
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
					const metadata = bibtexToMetadata(bibtex);
					const content = [
						'---',
						metadata,
						'---',
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

		this.addCommand({
			id: 'export-all-references',
			name: 'Export all references to BibTeX file',
			callback: async () => {
				const folder = this.settings.bibFolder.trim() || '';
				const abstractFolder = this.app.vault.getAbstractFileByPath(folder);
				
				if (!abstractFolder || !(abstractFolder instanceof TFolder)) {
					new Notice("Reference folder not found. Please check your settings.");
					return;
				}

				const bibtexEntries: string[] = [];
				const files = abstractFolder.children;

				for (const file of files) {
					if (file instanceof TFile && file.extension === 'md') {
						const content = await this.app.vault.read(file);
						
						// Try to extract from metadata first (new format)
						const metadataMatch = content.match(/^---\n([\s\S]*?)\n---/);
						if (metadataMatch) {
							const bibtex = metadataToBibtex(metadataMatch[1]);
							if (bibtex) {
								bibtexEntries.push(bibtex);
								continue;
							}
						}
						
						// Fallback to old BibTeX block format
						const bibtexMatch = content.match(/```bibtex\n([\s\S]*?)\n```/);
						if (bibtexMatch) {
							bibtexEntries.push(bibtexMatch[1].trim());
						}
					}
				}

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
				
				// Try to extract from metadata first (new format)
				const metadataMatch = content.match(/^---\n([\s\S]*?)\n---/);
				if (metadataMatch) {
					const bibtex = metadataToBibtex(metadataMatch[1]);
					if (bibtex) {
						bibtexReferences.push(bibtex);
						continue;
					}
				}
				
				// Fallback to old BibTeX block format for backward compatibility
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

function bibtexToMetadata(bibtex: string): string {
	// Extract entry type
	const typeMatch = bibtex.match(/^@(\w+)\{/);
	const entryType = typeMatch ? typeMatch[1].toLowerCase() : 'misc';
	
	// Extract cite key
	const citeKey = extractCiteKey(bibtex);
	
	// Extract all fields from BibTeX
	const extractField = (field: string): string | null => {
		const regex = new RegExp(`${field}\\s*=\\s*[{"]([^}"]+)[}"]`, 'i');
		const match = bibtex.match(regex);
		return match ? match[1].trim() : null;
	};
	
	// Common BibTeX fields
	const fields = [
		'author', 'title', 'year', 'publisher', 'journal', 
		'volume', 'number', 'pages', 'address', 'edition',
		'booktitle', 'editor', 'doi', 'isbn', 'issn',
		'url', 'note', 'series', 'chapter', 'organization',
		'school', 'institution', 'howpublished', 'month'
	];
	
	// Build metadata YAML
	const metadata: string[] = [];
	metadata.push(`type: ${entryType}`);
	metadata.push(`citekey: ${citeKey}`);
	
	for (const field of fields) {
		const value = extractField(field);
		if (value) {
			// Escape special YAML characters and handle multi-line values
			const escapedValue = value.includes(':') || value.includes('#') || value.includes('"') 
				? `"${value.replace(/"/g, '\\"')}"` 
				: value;
			metadata.push(`${field}: ${escapedValue}`);
		}
	}
	
	return metadata.join('\n');
}

function metadataToBibtex(metadata: string): string | null {
	try {
		// Parse YAML-like metadata into key-value pairs
		const lines = metadata.trim().split('\n');
		const fields: Record<string, string> = {};
		
		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex === -1) continue;
			
			const key = line.substring(0, colonIndex).trim();
			let value = line.substring(colonIndex + 1).trim();
			
			// Remove surrounding quotes if present
			if ((value.startsWith('"') && value.endsWith('"')) || 
			    (value.startsWith("'") && value.endsWith("'"))) {
				value = value.substring(1, value.length - 1);
			}
			
			// Unescape quotes
			value = value.replace(/\\"/g, '"');
			
			fields[key.toLowerCase()] = value;
		}
		
		if (!fields.type || !fields.citekey) {
			return null;
		}
		
		// Build BibTeX entry
		const bibtexLines: string[] = [];
		bibtexLines.push(`@${fields.type}{${fields.citekey},`);
		
		// Common BibTeX fields in typical order
		const fieldOrder = [
			'author', 'title', 'booktitle', 'editor', 'year', 
			'publisher', 'address', 'edition', 'journal', 'volume', 
			'number', 'pages', 'chapter', 'series', 'organization',
			'school', 'institution', 'howpublished', 'month',
			'doi', 'isbn', 'issn', 'url', 'note'
		];
		
		for (const field of fieldOrder) {
			if (fields[field] && field !== 'type' && field !== 'citekey') {
				bibtexLines.push(`  ${field} = {${fields[field]}},`);
			}
		}
		
		bibtexLines.push('}');
		return bibtexLines.join('\n');
	} catch (error) {
		return null;
	}
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

function formatInlineCitation(bibtex: string, page: string | null, format: BibliographyFormat): string {
	// Extract fields from BibTeX for inline citation
	const extractField = (field: string): string | null => {
		const regex = new RegExp(`${field}\\s*=\\s*[{"]([^}"]+)[}"]`, 'i');
		const match = bibtex.match(regex);
		return match ? match[1].trim() : null;
	};
	
	const author = extractField('author');
	const year = extractField('year');
	
	// Fallback to citekey if we can't extract author/year
	const citeKey = extractCiteKey(bibtex);
	
	if (!author && !year) {
		return page ? `${citeKey}, p. ${page}` : citeKey;
	}
	
	// Extract last name from author field
	let authorLastName = '';
	if (author) {
		// Handle "Last, First" or "First Last" format
		const authorParts = author.split(' and ')[0]; // Take first author only
		if (authorParts.includes(',')) {
			authorLastName = authorParts.split(',')[0].trim();
		} else {
			const nameParts = authorParts.trim().split(' ');
			authorLastName = nameParts[nameParts.length - 1];
		}
	}
	
	// If we still don't have author or year, fallback to citekey
	if (!authorLastName || !year) {
		return page ? `${citeKey}, p. ${page}` : citeKey;
	}
	
	// Format based on style
	if (format === 'apa') {
		// APA: (Author, Year, p. 123) or (Author, Year)
		if (page) {
			return `(${authorLastName}, ${year}, p. ${page})`;
		} else {
			return `(${authorLastName}, ${year})`;
		}
	} else if (format === 'chicago') {
		// Chicago: (Author Year, 123) or (Author Year)
		if (page) {
			return `(${authorLastName} ${year}, ${page})`;
		} else {
			return `(${authorLastName} ${year})`;
		}
	} else if (format === 'mla') {
		// MLA: (Author 123) or (Author)
		if (page) {
			return `(${authorLastName} ${page})`;
		} else {
			return `(${authorLastName})`;
		}
	} else {
		// LaTeX/BibTeX - use citekey
		if (page) {
			return `${citeKey}, ${page.includes('-') || page.includes('–') ? 'pp.' : 'p.'} ${page}`;
		} else {
			return citeKey;
		}
	}
}

function formatBibliographyEntry(bibtex: string, format: BibliographyFormat): string {
	if (format === 'latex') {
		// Return original BibTeX format
		return bibtex;
	} else if (format === 'mla') {
		// Convert BibTeX to MLA format
		return convertBibtexToMLA(bibtex);
	} else if (format === 'apa') {
		// Convert BibTeX to APA format
		return convertBibtexToAPA(bibtex);
	} else if (format === 'chicago') {
		// Convert BibTeX to Chicago format
		return convertBibtexToChicago(bibtex);
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

function convertBibtexToAPA(bibtex: string): string {
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
		const doi = extractField('doi');
		
		let apaEntry = '';
		
		// Format author names for APA (Last, F. M.)
		let formattedAuthor = '';
		if (author) {
			const authors = author.split(' and ');
			const formatAuthor = (name: string) => {
				const parts = name.trim().split(',');
				if (parts.length >= 2) {
					const lastName = parts[0].trim();
					const firstName = parts[1].trim();
					const initials = firstName.split(' ')
						.map(n => n.charAt(0).toUpperCase() + '.')
						.join(' ');
					return `${lastName}, ${initials}`;
				}
				return name;
			};
			
			if (authors.length === 1) {
				formattedAuthor = formatAuthor(authors[0]);
			} else if (authors.length === 2) {
				formattedAuthor = `${formatAuthor(authors[0])}, & ${formatAuthor(authors[1])}`;
			} else if (authors.length <= 20) {
				const formatted = authors.slice(0, -1).map(formatAuthor);
				formattedAuthor = formatted.join(', ') + ', & ' + formatAuthor(authors[authors.length - 1]);
			} else {
				const formatted = authors.slice(0, 19).map(formatAuthor);
				formattedAuthor = formatted.join(', ') + ' . . . ' + formatAuthor(authors[authors.length - 1]);
			}
		}
		
		// Build APA citation based on entry type
		if (entryType === 'book') {
			if (formattedAuthor) apaEntry += formattedAuthor + ' ';
			if (year) apaEntry += `(${year}). `;
			if (title) apaEntry += `*${title}*`;
			if (edition && edition !== '1') apaEntry += ` (${edition} ed.)`;
			apaEntry += '. ';
			if (publisher) apaEntry += `${publisher}.`;
		} else if (entryType === 'article') {
			if (formattedAuthor) apaEntry += formattedAuthor + ' ';
			if (year) apaEntry += `(${year}). `;
			if (title) apaEntry += `${title}. `;
			if (journal) {
				apaEntry += `*${journal}*`;
				if (volume) {
					apaEntry += `, *${volume}*`;
					if (number) apaEntry += `(${number})`;
				}
				if (pages) apaEntry += `, ${pages}`;
				apaEntry += '.';
			}
			if (doi) apaEntry += ` https://doi.org/${doi}`;
		} else if (entryType === 'incollection' || entryType === 'inbook') {
			if (formattedAuthor) apaEntry += formattedAuthor + ' ';
			if (year) apaEntry += `(${year}). `;
			if (title) apaEntry += `${title}. `;
			if (editor) {
				apaEntry += `In ${editor} (Ed.), `;
			}
			if (booktitle) apaEntry += `*${booktitle}*`;
			if (pages) apaEntry += ` (pp. ${pages})`;
			apaEntry += '. ';
			if (publisher) apaEntry += `${publisher}.`;
		} else {
			// Generic format for other types
			if (formattedAuthor) apaEntry += formattedAuthor + ' ';
			if (year) apaEntry += `(${year}). `;
			if (title) apaEntry += `*${title}*. `;
			if (publisher) apaEntry += `${publisher}.`;
		}
		
		// Clean up double periods and extra spaces
		return apaEntry.trim().replace(/\.\.+/g, '.').replace(/\s+/g, ' ');
	} catch (error) {
		// If parsing fails, return the original bibtex
		return bibtex;
	}
}

function convertBibtexToChicago(bibtex: string): string {
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
		
		let chicagoEntry = '';
		
		// Format author names for Chicago (Last, First, and First Last)
		let formattedAuthor = '';
		if (author) {
			const authors = author.split(' and ');
			if (authors.length === 1) {
				formattedAuthor = authors[0];
			} else if (authors.length === 2) {
				formattedAuthor = `${authors[0]}, and ${authors[1]}`;
			} else if (authors.length === 3) {
				formattedAuthor = `${authors[0]}, ${authors[1]}, and ${authors[2]}`;
			} else {
				formattedAuthor = `${authors[0]} et al.`;
			}
		}
		
		// Build Chicago citation based on entry type
		if (entryType === 'book') {
			if (formattedAuthor) chicagoEntry += formattedAuthor + '. ';
			if (title) chicagoEntry += `*${title}*. `;
			if (edition && edition !== '1') {
				const edNum = parseInt(edition.replace(/[^0-9]/g, ''), 10);
				if (!isNaN(edNum)) {
					let suffix = 'th';
					if (edNum % 10 === 1 && edNum % 100 !== 11) suffix = 'st';
					else if (edNum % 10 === 2 && edNum % 100 !== 12) suffix = 'nd';
					else if (edNum % 10 === 3 && edNum % 100 !== 13) suffix = 'rd';
					chicagoEntry += `${edNum}${suffix} ed. `;
				} else {
					// If parsing fails, use the edition string as-is
					chicagoEntry += `${edition} ed. `;
				}
			}
			const pubParts = [];
			if (address) pubParts.push(address);
			if (publisher) pubParts.push(publisher);
			if (pubParts.length > 0) chicagoEntry += pubParts.join(': ');
			if (year) {
				if (pubParts.length > 0) chicagoEntry += ', ';
				chicagoEntry += year;
			}
			chicagoEntry += '.';
		} else if (entryType === 'article') {
			if (formattedAuthor) chicagoEntry += formattedAuthor + '. ';
			if (title) chicagoEntry += `"${title}." `;
			if (journal) {
				chicagoEntry += `*${journal}*`;
				const details = [];
				if (volume) details.push(volume);
				if (number) details.push(`no. ${number}`);
				if (details.length > 0) chicagoEntry += ' ' + details.join(', ');
			}
			if (year) chicagoEntry += ` (${year})`;
			if (pages) chicagoEntry += `: ${pages}`;
			chicagoEntry += '.';
		} else if (entryType === 'incollection' || entryType === 'inbook') {
			if (formattedAuthor) chicagoEntry += formattedAuthor + '. ';
			if (title) chicagoEntry += `"${title}." `;
			if (booktitle) {
				chicagoEntry += 'In ';
				if (editor) chicagoEntry += `edited by ${editor}, `;
				chicagoEntry += `*${booktitle}*`;
			}
			if (pages) chicagoEntry += `, ${pages}`;
			chicagoEntry += '. ';
			const pubParts = [];
			if (address) pubParts.push(address);
			if (publisher) pubParts.push(publisher);
			if (pubParts.length > 0) chicagoEntry += pubParts.join(': ');
			if (year) {
				if (pubParts.length > 0) chicagoEntry += ', ';
				chicagoEntry += year;
			}
			chicagoEntry += '.';
		} else {
			// Generic format for other types
			if (formattedAuthor) chicagoEntry += formattedAuthor + '. ';
			if (title) chicagoEntry += `*${title}*. `;
			const pubParts = [];
			if (address) pubParts.push(address);
			if (publisher) pubParts.push(publisher);
			if (pubParts.length > 0) chicagoEntry += pubParts.join(': ');
			if (year) {
				if (pubParts.length > 0) chicagoEntry += ', ';
				chicagoEntry += year;
			}
			if (pubParts.length > 0 || year) chicagoEntry += '.';
		}
		
		// Clean up double periods and extra spaces
		return chicagoEntry.trim().replace(/\.\.+/g, '.').replace(/\s+/g, ' ');
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
