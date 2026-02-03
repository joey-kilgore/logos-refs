/**
 * Utilities for converting between BibTeX and YAML metadata formats
 */

import { extractCiteKey } from './clipboard-parser';

export function bibtexToMetadata(bibtex: string): string {
	// Extract entry type
	const typeMatch = bibtex.match(/^@(\w+)\{/);
	const entryType = typeMatch ? typeMatch[1].toLowerCase() : 'misc';
	
	// Extract cite key
	const citeKey = extractCiteKey(bibtex);
	
	// Extract all fields from BibTeX
	const extractField = (field: string): string | null => {
		// Match field = {value} or field = "value"
		// Note: This regex handles one level of nested braces. BibTeX fields with
		// multiple levels of nesting (rare in practice) may not be fully extracted.
		// For the typical Logos output, this is sufficient.
		const braceRegex = new RegExp(`${field}\\s*=\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, 'i');
		const quoteRegex = new RegExp(`${field}\\s*=\\s*"([^"]*)"`, 'i');
		
		let match = bibtex.match(braceRegex);
		if (!match) {
			match = bibtex.match(quoteRegex);
		}
		
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
			// Always quote values to avoid YAML parsing issues
			// In YAML double-quoted strings, we need to escape:
			// - backslashes as \\
			// - double quotes as \"
			// - newlines as \n
			// - tabs as \t
			// - carriage returns as \r
			const escapedValue = value
				.replace(/\\/g, '\\\\')  // Escape backslashes first
				.replace(/"/g, '\\"')     // Then escape quotes
				.replace(/\n/g, '\\n')    // Escape newlines
				.replace(/\r/g, '\\r')    // Escape carriage returns
				.replace(/\t/g, '\\t');   // Escape tabs
			
			metadata.push(`${field}: "${escapedValue}"`);
		}
	}
	
	return metadata.join('\n');
}

export function metadataToBibtex(metadata: string): string | null {
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
			if (value.length >= 2) {
				if ((value.startsWith('"') && value.endsWith('"')) || 
				    (value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1);
					// Unescape YAML double-quoted string escapes
					// Note: Order matters! Must unescape in reverse order of escaping
					// to correctly handle sequences like \\" which should become "
					value = value
						.replace(/\\n/g, '\n')   // Unescape newlines
						.replace(/\\r/g, '\r')   // Unescape carriage returns
						.replace(/\\t/g, '\t')   // Unescape tabs
						.replace(/\\"/g, '"')    // Unescape quotes
						.replace(/\\\\/g, '\\'); // Unescape backslashes (must be last)
				}
			}
			
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
