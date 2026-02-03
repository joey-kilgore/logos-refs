/**
 * Utilities for file operations - creating and updating reference notes
 */

import { App, TFile, TFolder } from 'obsidian';
import { bibtexToMetadata, metadataToBibtex } from './bibtex-converter';
import type { BibliographyFormat } from '../types';
import { formatBibliographyEntry } from './citation-formatter';

export async function createOrUpdateReferenceNote(
	app: App,
	filePath: string,
	folder: string,
	bibtex: string,
	linkBack: string
): Promise<void> {
	const abstractFile = app.vault.getAbstractFileByPath(filePath);
	const abstractFileFolder = app.vault.getAbstractFileByPath(folder);
	
	if (!abstractFile) {
		if (folder && (!abstractFileFolder || !(abstractFileFolder instanceof TFolder))) {
			// if a folder was provided and either
			//   there is no folder, or the folder is not an instance of a folder
			// then we need to create the folder
			await app.vault.createFolder(folder);
		}
		// Remove pages field from bibtex before converting to metadata
		const bibtexWithoutPages = bibtex.replace(/pages\s*=\s*{[^}]*},?\s*/gi, "");
		const metadata = bibtexToMetadata(bibtexWithoutPages);
		const content = [
			'---',
			metadata,
			'---',
			'',
			'## Citations',
			`- ${linkBack}`
		].join('\n');
		await app.vault.create(filePath, content);
	} else {
		let refNote = '';
		if (abstractFile instanceof TFile) {
			refNote = await app.vault.read(abstractFile);
		} else {
			throw new Error(`Could not read ${filePath}: not a valid file`);
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
			await app.vault.modify(abstractFile, updatedContent);
		}
	}
}

export async function getAllLinksInDocument(app: App, filePath: string): Promise<string[]> {
	const abstractFile = app.vault.getAbstractFileByPath(filePath);
	if (!(abstractFile instanceof TFile)) return [];

	const cache = app.metadataCache.getFileCache(abstractFile);
	if (!cache || !cache.links) return [];

	// Extract just the link target (removing any alias), and remove duplicates
	const uniqueLinks = Array.from(new Set(cache.links.map(link => link.link)));
	return uniqueLinks;
}

export async function getBibtexFromLinks(app: App, links: string[]): Promise<string[]> {
	const bibtexReferences: string[] = [];
	for (const link of links) {
		const file = app.vault.getAbstractFileByPath(link);
		if (file instanceof TFile) {
			const content = await app.vault.read(file);
			
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

export async function updateBibliographyInDocument(
	app: App,
	activeFile: TFile,
	bibliographyList: string
): Promise<void> {
	const content = await app.vault.read(activeFile);
	
	// Check if a bibliography already exists and replace it
	const bibliographyRegex = /## Bibliography\n[\s\S]*?(?=\n##\s|\n---(?:\s|$)|$)/;
	let updatedContent: string;
	
	if (bibliographyRegex.test(content)) {
		// Replace existing bibliography, preserving spacing before next section
		updatedContent = content.replace(bibliographyRegex, `## Bibliography\n${bibliographyList}\n`);
	} else {
		// Add new bibliography at the end
		updatedContent = `${content}\n\n## Bibliography\n${bibliographyList}`;
	}
	
	await app.vault.modify(activeFile, updatedContent);
}

export async function collectReferencesFromFolder(
	app: App,
	folder: string
): Promise<string[]> {
	const abstractFolder = app.vault.getAbstractFileByPath(folder);
	
	if (!abstractFolder || !(abstractFolder instanceof TFolder)) {
		throw new Error("Reference folder not found");
	}

	const bibtexEntries: string[] = [];
	const files = abstractFolder.children;

	for (const file of files) {
		if (file instanceof TFile && file.extension === 'md') {
			const content = await app.vault.read(file);
			
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

	return bibtexEntries;
}

export function formatBibliographyList(
	bibtexReferences: string[],
	format: BibliographyFormat
): string {
	const formattedReferences = bibtexReferences.map(bibtex => {
		if (format === 'latex') {
			// For LaTeX, wrap in code block
			return '```bibtex\n' + bibtex + '\n```';
		} else {
			// For MLA, convert and display as plain text
			return formatBibliographyEntry(bibtex, format);
		}
	});
	return formattedReferences.join("\n\n");
}
