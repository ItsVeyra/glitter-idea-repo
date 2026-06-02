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

This workspace keeps `manifest.json` and `styles.css` mirrored for source review. `npm run build` writes the reproducible review bundle to `dist/main.js`.
