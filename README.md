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

Build the static SPA assets into the consumer repo when its graph payload changes:

```powershell
node ..\\GameCult-Quartz\\scripts\\build-graph-spa.mjs --siteRoot E:\\Projects\\Mimir --outputDir static/epiphany-graph
```

The SPA source lives in `quartz/graph-spa`. It currently imports the shared `EpiphanyGraphViewer`
from a sibling `EpiphanyGraph` checkout during local builds, so generated assets should be committed
by consumer sites until that viewer is packaged as a normal dependency.

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
