/**
 * Utilities for formatting citations in various bibliography formats
 */

import type { BibliographyFormat } from '../types';
import { extractCiteKey } from './clipboard-parser';

export function formatInlineCitation(bibtex: string, page: string | null, format: BibliographyFormat): string {
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

export function formatBibliographyEntry(bibtex: string, format: BibliographyFormat): string {
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
