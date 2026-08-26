# GameCult-Quartz

Shared Quartz engine, reusable GitHub Pages workflow, and the minimum amount of ceremony needed to keep `gamecult-site` and `AetheriaLore` from turning into two copy-pasted maintenance problems with different logos.

## What Lives Here

- Shared Quartz source, dependencies, and build tooling
- `scripts/build-site.mjs` for staging a site repo against the shared engine
- `scripts/build-graph-spa.mjs` for building the shared fullscreen graph SPA into a consumer site
- Reusable Pages workflow at `.github/workflows/quartz-pages.yml`
- Generic defaults only

Site-specific content, mastheads, sidebars, render hooks, and custom chrome stay in the consumer repos as overlays.

## Consumer Repo Shape

Each site repo is expected to provide:

- a content root such as `GameCult/` or `Aetheria/`
- a `site/` overlay containing:
  - `quartz.config.ts`
  - `quartz.layout.ts`
  - optional site-specific `quartz/components/*`
  - optional site-specific `quartz/styles/custom.scss`
  - optional `quartz/static/*`

The build script stages the shared engine into `.quartz-build/engine`, hardlinks the site overlay on top, and writes output to the consumer repo's `quartz-site/public`.

## Local Use

Install dependencies once in this repo:

```powershell
npm ci
```

Then from a consumer repo, use its launcher script, or call the shared builder directly:

```powershell
node ..\\GameCult-Quartz\\scripts\\build-site.mjs build --siteRoot E:\\Projects\\gamecult-site --contentDir GameCult --overlayDir site --outputDir quartz-site/public
```

## Fullscreen Graph SPA

Consumer sites can render the shared graph surface with `Component.GameCultGraphSpaShell(...)`.
The component only owns the mount point and asset tags; the consumer overlay decides where it appears.

The shell's default `epiphany-graph` asset route and mount class remain a compatibility contract for
the deployed Mimir and gamecult.org sites. New or migrated consumers should pass the
`norn-graph` asset paths and `gamecult-norn-graph-root` explicitly.

Build the static SPA assets into the consumer repo when its graph payload changes:

```powershell
node ..\\GameCult-Quartz\\scripts\\build-graph-spa.mjs --siteRoot E:\\Projects\\Mimir
```

The SPA source lives in `quartz/graph-spa`. It consumes the admitted build of
`@gamecult/norn-viewer` from a sibling `Norn` checkout. The builder verifies the
revision in `quartz/graph-spa/norn-revision.txt`, builds the Norn package, and then
builds the Quartz adapter. It rejects dirty Quartz or Norn sources and writes
`bundle.provenance` with both revisions and every deployable artifact digest.
Generated assets remain committed by consumer sites. Pass `--verify` with the same
site and output arguments to verify a committed bundle without rebuilding it.

GameCult-Quartz owns content-index projection, article loading, hash navigation,
and the fullscreen shell. Norn owns graph interaction and rendering. Consumer
sites provide taxonomy, filtering, placement, and presentation through
`GameCultGraphSpaShell` configuration and overlay styles.

## Shared Interactive Embeds

### `Plugin.InkEmbedder`

Use `Plugin.InkEmbedder()` in a consumer site's emitter list to enable reusable
Ink embeds. The plugin copies Sai's packaged browser assets from `@gamecult/sai`
into the built site's `/static/interactive/` directory and injects the player
CSS and script.

Authors embed stories with plain HTML:

```html
<div
  class="sai-player"
  data-ink-format="visual-novel"
  data-ink-story="/static/interactive/example/story.ink.json"
  data-visual-manifest="/static/interactive/example/visual-manifest.json"
  data-scene-label="Scene Name"
></div>
```

Supported formats:

- `data-ink-format="raven"` or omitted: cheap interactive-fiction transcript
  layout for Raven Collective-style Ink.
- `data-ink-format="visual-novel"`: fixed scene view with bottom dialogue bar,
  speaker avatar, and choices/continue controls inside the dialogue surface.
- `data-ink-format="cinematic"`: slide/deck layout with background plates,
  captions, and optional references.

The legacy `data-ink-mode` attribute still works. Future sprite staging should
extend Sai rather than inventing another site-local player. Existing
`.aetheria-ink-player` containers are still initialised by Sai as a migration
bridge, but new embeds should use `.sai-player`.

## Shared Components

### `AutoIndexFolder`

Use `Component.AutoIndexFolder(...)` when a consumer site needs a folder landing page to
render a newest-first card index from Markdown files under that folder. The shared engine owns
the repeated mechanics:

- find pages under `rootSlug`
- exclude the folder `index` page
- honor a site-chosen hide frontmatter flag
- sort by published, created, then modified date
- derive author labels from `author` or `authors`
- render card markup with a site-chosen class prefix
- build year-grouped sidebar data with `buildAutoIndexSidebarData`

Consumer overlays still own the site-specific decision to use the component, the display copy,
the class prefix, and the CSS. If an index needs custom editorial behavior that only one site
understands, keep that behavior in the site overlay.

## Design Rule

If a change only makes sense for one site, it does not belong in this repo. Put it in that site's overlay and leave the engine sober.
