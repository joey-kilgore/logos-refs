export type BibliographyFormat = 'latex' | 'mla' | 'apa' | 'chicago';

export interface LogosPluginSettings {
	bibFolder: string;
	citationCounters: Record<string, number>;
	bibliographyFormat: BibliographyFormat;
	citationCalloutType: string;
}

export const DEFAULT_SETTINGS: LogosPluginSettings = {
	bibFolder: '', // default to vault root
	citationCounters: {},
	bibliographyFormat: 'latex',
	citationCalloutType: 'Logos Ref',
};
