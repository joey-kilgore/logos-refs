# Logos-refs plugin

![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/joey-kilgore/logos-refs?style=for-the-badge&sort=semver)
![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22logos-refs%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=for-the-badge)
![GitHub License](https://img.shields.io/github/license/joey-kilgore/logos-refs?style=for-the-badge)
![Maintenance](https://img.shields.io/maintenance/yes/2025?style=for-the-badge)

An [Obsidian](https://obsidian.md) plugin that simplifies referencing and linking material from [Logos Bible Software](https://www.logos.com/). Easily create formatted citations with BibTeX references and automatically generate bibliographies for your notes.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Pasting Logos References](#pasting-logos-references)
  - [Generating a Bibliography](#generating-a-bibliography)
- [File Structure & Organization](#file-structure--organization)
- [Development](#development)
- [Contributing](#contributing)
- [Support](#support)

## Features

### 📋 Paste Logos Reference with BibTeX
Copy a passage from Logos Bible Software and paste it directly into your Obsidian notes with automatic citation formatting:
- Creates formatted quote blocks with proper attribution
- Automatically extracts BibTeX citation data
- Generates or updates reference notes with bidirectional links
- Handles page numbers intelligently (single page vs. page ranges)
- Assigns unique block IDs for precise reference tracking
- Maintains a citation counter for each note

### 📚 Generate Bibliography
Automatically compile all BibTeX references from your current note into a formatted bibliography:
- Scans all links in your document for BibTeX references
- Supports multiple bibliography formats (LaTeX/BibTeX and MLA)
- Updates existing bibliography sections or creates new ones
- Removes duplicate entries automatically

## Installation

### From Obsidian Community Plugins
1. Open Obsidian Settings
2. Navigate to Community Plugins and disable Safe Mode
3. Click Browse and search for "logos-refs"
4. Install the plugin and enable it

### Initial Setup
1. In the logos-refs plugin settings, configure your reference directory (e.g., `refs` or `sources/biblical`)
2. In Logos Bible Software, go to Program Settings → Citation and set the citation style to **BibTeX Style**
3. You're ready to start taking notes!

## Configuration

Access the plugin settings through Obsidian Settings → Community Plugins → Logos-refs.

### BibTeX Note Folder
**Default:** Vault root

Specify the folder where reference notes will be created. The plugin provides folder autocomplete to help you select an existing folder. If the folder doesn't exist, it will be created automatically when you paste your first reference.

**Examples:**
- `refs` - A simple refs folder at the vault root
- `sources/biblical` - Nested folder structure
- Leave empty to create reference notes at the vault root

### Bibliography Format
**Default:** LaTeX (BibTeX)

Choose how bibliographies are formatted when using the "List all BibTeX references" command:
- **LaTeX (BibTeX)**: Displays BibTeX entries in code blocks, ideal for academic writing with LaTeX
- **MLA**: Converts BibTeX to MLA format for humanities writing

## Usage

### Pasting Logos References

https://github.com/user-attachments/assets/444c5892-8e17-43c4-8c8b-27a319315eec

1. In Logos Bible Software, select and copy the text you want to reference (Ctrl/Cmd+C)
2. In your Obsidian note, use the command palette (Ctrl/Cmd+P) and run **"Paste Logos reference with BibTeX"**
   - Or set up a hotkey for faster access
3. The plugin will:
   - Insert a formatted quote block with your copied text
   - Create a link to a reference note (or update an existing one)
   - Add page numbers if they were included in the Logos copy
   - Create a unique block reference ID for precise linking

**What gets created:**

In your current note:
```markdown
> [!Logos Ref]
> Your copied text from Logos appears here
> [[refs/AuthorYear|AuthorYear, p. 123]] ^AuthorYear-1
```

In the reference note (`refs/AuthorYear.md`):
```markdown
\`\`\`bibtex
@book{AuthorYear,
  author = {Author Name},
  title = {Book Title},
  publisher = {Publisher},
  year = {2020}
}
\`\`\`

## Citations
- [[YourNote#^AuthorYear-1]] → p. 123
```

### Generating a Bibliography

After citing multiple sources in your note, you can automatically generate a bibliography:

1. Use the command palette (Ctrl/Cmd+P) and run **"List all BibTeX references"**
2. The plugin will:
   - Scan all links in your current document
   - Collect BibTeX entries from linked reference notes
   - Generate a formatted bibliography based on your chosen format
   - Add or update a "## Bibliography" section at the end of your note

**Example output (LaTeX format):**
```markdown
## Bibliography

\`\`\`bibtex
@book{AuthorYear,
  author = {Author Name},
  title = {Book Title},
  publisher = {Publisher},
  year = {2020}
}
\`\`\`

\`\`\`bibtex
@article{Smith2019,
  author = {Smith, John},
  title = {Article Title},
  journal = {Journal Name},
  year = {2019}
}
\`\`\`
```

**Example output (MLA format):**
```markdown
## Bibliography

Author Name. *Book Title*. Publisher, 2020.

Smith, John. "Article Title." *Journal Name*, vol. 10, no. 2, 2019, pp. 45-67.
```

## File Structure & Organization

The plugin creates and manages reference notes automatically. Here's a typical structure:

```
your-vault/
├── refs/                           # Your configured reference folder
│   ├── Wright2013.md              # Individual reference notes
│   ├── Carson1991.md
│   └── Keener2014.md
├── notes/
│   ├── Sermon Notes.md            # Your content notes with citations
│   └── Research Paper.md          # Citations link to refs folder
└── Daily Notes/
    └── 2025-01-30.md              # Can cite from anywhere
```

**Reference Note Structure:**
Each reference note contains:
1. A BibTeX code block with the full citation
2. A "## Citations" section listing all places where this source is referenced
3. Bidirectional links back to specific quote blocks in your notes

**Benefits of this structure:**
- See all places you've cited a particular source
- Navigate between quotes and their sources seamlessly
- Keep your reference library organized and reusable
- Export BibTeX for use in other tools (LaTeX, Zotero, etc.)

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/joey-kilgore/logos-refs.git
cd logos-refs

# Install dependencies
npm install

# Build the plugin
npm run build

# For development with auto-rebuild
npm run dev
```

### Contributing

Contributions are welcome! Here's how you can help:

**Reporting Bugs**
- Check existing [Issues](https://github.com/joey-kilgore/logos-refs/issues) first to avoid duplicates
- Include steps to reproduce the bug
- Describe expected vs. actual behavior
- Include your Obsidian version and plugin version
- Screenshots or screen recordings are helpful!

**Requesting Features**
- Search existing [Issues](https://github.com/joey-kilgore/logos-refs/issues) for similar requests
- Clearly describe the feature and its use case
- Explain how it would benefit Logos users
- Join the [Discussion](https://github.com/joey-kilgore/logos-refs/discussions) for broader ideas

**Pull Requests**
- Fork the repository and create a feature branch
- Follow the existing code style
- Test your changes thoroughly
- Update documentation if needed
- Submit a PR with a clear description of your changes

This plugin is under continuous development, and your feedback helps make it better for the Logos community!

## Support

If you find this plugin helpful, consider showing your support:

- ⭐ **Star the project** on GitHub
- ☕ **[Sponsor the development](https://github.com/sponsors/joey-kilgore)** 
- 💬 **Share feedback** in [Issues](https://github.com/joey-kilgore/logos-refs/issues) or [Discussions](https://github.com/joey-kilgore/logos-refs/discussions)
- 📢 **Tell others** who use Logos and Obsidian

---

## Links

- [Obsidian](https://obsidian.md) - The knowledge base application
- [Logos Bible Software](https://www.logos.com/) - Biblical study software
- [Plugin Documentation](https://github.com/joey-kilgore/logos-refs)
- [Report Issues](https://github.com/joey-kilgore/logos-refs/issues)
- [Discussions](https://github.com/joey-kilgore/logos-refs/discussions)

## License

[MIT License](LICENSE) - Copyright (c) 2025 Joey Kilgore
