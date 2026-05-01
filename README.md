# GameCult-Quartz

Shared Quartz engine, reusable GitHub Pages workflow, and the minimum amount of ceremony needed to keep `gamecult-site` and `AetheriaLore` from turning into two copy-pasted maintenance problems with different logos.

## What Lives Here

- Shared Quartz source, dependencies, and build tooling
- `scripts/build-site.mjs` for staging a site repo against the shared engine
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

## Design Rule

If a change only makes sense for one site, it does not belong in this repo. Put it in that site's overlay and leave the engine sober.
