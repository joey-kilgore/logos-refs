# Source Code Structure

This directory contains the modular source code for the Logos References plugin.

## Directory Organization

```
src/
├── main.ts                      # Plugin entry point and command orchestration
├── settings.ts                  # Settings interface and settings tab UI
├── types.ts                     # TypeScript type definitions and interfaces
├── ui/                          # User interface components
│   ├── folder-suggest.ts        # Folder autocomplete component
│   └── suggest.ts               # Base suggestion/autocomplete classes
└── utils/                       # Utility functions organized by concern
    ├── bibtex-converter.ts      # BibTeX ↔ YAML metadata conversion
    ├── citation-formatter.ts    # Citation formatting (LaTeX, MLA, APA, Chicago)
    ├── clipboard-parser.ts      # Parse Logos clipboard data
    └── file-manager.ts          # File creation and update operations
```

## Module Responsibilities

### Core Files

- **main.ts**: Plugin lifecycle and command registration. Orchestrates other modules to provide the three main commands: paste reference, list bibliography, and export references.

- **settings.ts**: Settings tab UI and user preferences management. Handles the plugin settings interface shown in Obsidian's settings panel.

- **types.ts**: TypeScript type definitions, interfaces, and constants shared across the plugin.

### UI Components (`ui/`)

- **folder-suggest.ts**: Provides autocomplete functionality for folder selection in settings.

- **suggest.ts**: Base classes for creating suggestion/autocomplete UI components. Used by folder-suggest.

### Utilities (`utils/`)

- **clipboard-parser.ts**: Functions for parsing Logos Bible Software clipboard data, extracting cite keys, and handling page numbers.

- **bibtex-converter.ts**: Bidirectional conversion between BibTeX format and YAML frontmatter metadata. Handles field extraction and escaping.

- **citation-formatter.ts**: Formats citations in multiple bibliography styles:
  - LaTeX/BibTeX
  - MLA (Modern Language Association)
  - APA (American Psychological Association)
  - Chicago Manual of Style

- **file-manager.ts**: File system operations for creating/updating reference notes, managing bibliographies, and collecting references from folders.

## Design Principles

1. **Separation of Concerns**: Each module has a single, well-defined responsibility.

2. **Pure Functions**: Utility functions are designed to be pure and testable where possible.

3. **Type Safety**: TypeScript types are centralized in `types.ts` and imported where needed.

4. **Minimal Dependencies**: Modules only import what they need, reducing coupling.

5. **Extensibility**: New bibliography formats or features can be added without touching unrelated code.

## Building

The build process (configured in `esbuild.config.mjs`) bundles all TypeScript files into a single `main.js` file for distribution.

```bash
npm run build      # Production build
npm run dev        # Development build with watch mode
```
