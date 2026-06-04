# Glitter source review workspace

This directory contains the minimal buildable source workspace for reviewing the Glitter Obsidian plugin.

## Install

```bash
npm install
```

## Verify

```bash
npm run test
npm run check
npm run build
```

## Published files

The community-plugin release files stay in the repository root:

- `../manifest.json`
- `../main.js`
- `../styles.css`

This workspace keeps `manifest.json`, `main.js`, and `styles.css` mirrored for source review. `npm run build` refreshes the local review bundle at `main.js`, and `npm run release:local` exports a sibling `glitter-plugin-release/` directory when local release verification is needed.
