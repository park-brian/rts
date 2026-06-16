# StarCraft Reference Art Cache

This folder is for local visual research only. Images downloaded here come from Liquipedia pages and are used to study silhouettes before drawing original SVG sprites by hand.

Do not ship these images in the game. Do not trace them. Do not commit downloaded media unless each file's license has been checked and explicitly allows redistribution in this repo.

Keep:

- `manifest.json`: source URLs, downloaded file paths, and fetch notes.
- `fetch-liquipedia-reference-art.mjs`: repeatable reference fetcher.

Ignored locally:

- downloaded `.jpg`, `.png`, `.gif`, `.webp`, `.avif`, `.jpeg` files.

## Current Cache

Last fetched: see `manifest.json`.

- Manifest entries: 100
- Downloaded reference images: 99
- Known missing image: Scarab

The Scarab page exists on Liquipedia, but it does not expose a dedicated unit-art image through the page metadata or an infobox. This is fine for our purposes: draw Scarab as a simple glowing orb/projectile, using the Reaver reference only for context.

Run the fetcher from the repo root:

```powershell
node docs/design/references/sc/fetch-liquipedia-reference-art.mjs
```
