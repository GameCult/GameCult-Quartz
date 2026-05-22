import { QuartzPluginData } from "../plugins/vfile"
import { FullSlug, resolveRelative } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

type AutoIndexPage = QuartzPluginData & {
  slug: FullSlug
}

export type AutoIndexSidebarLink = {
  label: string
  slug: FullSlug
}

export type AutoIndexSidebarGroup = {
  title: string
  links: AutoIndexSidebarLink[]
}

export type AutoIndexSidebarData = {
  title: string
  slug: FullSlug
  tagline?: string
  summary?: string
  groups: AutoIndexSidebarGroup[]
}

export interface AutoIndexOptions {
  rootSlug: string
  indexSlug?: string
  classPrefix?: string
  hideFrontmatterKey?: string
  defaultAuthor?: string
  emptyDescription?: string
  showDescriptionIntro?: boolean
  sidebarTagline?: string
  sidebarSummary?: (count: number) => string
}

const defaultOptions: Required<AutoIndexOptions> = {
  rootSlug: "Blog",
  indexSlug: "Blog/index",
  classPrefix: "auto-index",
  hideFrontmatterKey: "hideFromAutoIndex",
  defaultAuthor: "GameCult",
  emptyDescription: "This post exists, which is already more than many ideas manage.",
  showDescriptionIntro: false,
  sidebarTagline: "Recent notes, newest first.",
  sidebarSummary: (count) => `${count} entries, newest first.`,
}

function normalizedOptions(options?: AutoIndexOptions): Required<AutoIndexOptions> {
  const rootSlug = options?.rootSlug?.replace(/\/+$/, "") || defaultOptions.rootSlug
  return {
    ...defaultOptions,
    ...options,
    rootSlug,
    indexSlug: options?.indexSlug ?? `${rootSlug}/index`,
  }
}

function pageDateValue(file: QuartzPluginData) {
  return file.dates?.published ?? file.dates?.created ?? file.dates?.modified
}

function formatPageDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function isHidden(file: QuartzPluginData, hideFrontmatterKey: string) {
  return file.frontmatter?.[hideFrontmatterKey] === true
}

export function getAutoIndexAuthorLabel(file: QuartzPluginData, defaultAuthor = "GameCult") {
  const author = file.frontmatter?.author
  if (typeof author === "string" && author.trim().length > 0) {
    return author.trim()
  }

  const authors = file.frontmatter?.authors
  if (Array.isArray(authors)) {
    const names = authors
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim())

    if (names.length > 0) {
      return names.join(", ")
    }
  }

  return defaultAuthor
}

function getPageDescription(page: QuartzPluginData, emptyDescription: string) {
  const frontmatterDescription = page.frontmatter?.description
  if (typeof frontmatterDescription === "string" && frontmatterDescription.trim().length > 0) {
    return frontmatterDescription.trim()
  }

  const pageDescription = page.description
  if (typeof pageDescription === "string" && pageDescription.trim().length > 0) {
    return pageDescription.trim()
  }

  const socialDeck = page.frontmatter?.socialDeck
  if (typeof socialDeck === "string" && socialDeck.trim().length > 0) {
    return socialDeck.trim()
  }

  return emptyDescription
}

export function collectAutoIndexPages(
  allFiles: QuartzPluginData[],
  options?: AutoIndexOptions,
): AutoIndexPage[] {
  const resolved = normalizedOptions(options)
  const prefix = `${resolved.rootSlug}/`

  return allFiles
    .filter(
      (file): file is AutoIndexPage =>
        typeof file.slug === "string" &&
        file.slug.startsWith(prefix) &&
        file.slug !== resolved.indexSlug &&
        !isHidden(file, resolved.hideFrontmatterKey) &&
        !!file.frontmatter?.title,
    )
    .sort((a, b) => {
      const aDate = pageDateValue(a)
      const bDate = pageDateValue(b)

      if (aDate && bDate) {
        return bDate.getTime() - aDate.getTime()
      }

      if (aDate && !bDate) {
        return -1
      }

      if (!aDate && bDate) {
        return 1
      }

      return (a.frontmatter?.title ?? "").localeCompare(b.frontmatter?.title ?? "")
    })
}

export function buildAutoIndexSidebarData(
  file: QuartzPluginData,
  allFiles: QuartzPluginData[],
  options?: AutoIndexOptions,
): AutoIndexSidebarData {
  const resolved = normalizedOptions(options)
  const pages = collectAutoIndexPages(allFiles, resolved)
  const groupsByYear = new Map<string, AutoIndexSidebarLink[]>()

  for (const page of pages) {
    const date = pageDateValue(page)
    const year = date ? date.getUTCFullYear().toString() : "Undated"
    const existing = groupsByYear.get(year) ?? []
    existing.push({
      label: page.frontmatter?.title ?? page.slug,
      slug: page.slug,
    })
    groupsByYear.set(year, existing)
  }

  return {
    title: file.frontmatter?.title ?? "Index",
    slug: file.slug as FullSlug,
    tagline: resolved.sidebarTagline,
    summary: resolved.sidebarSummary(pages.length),
    groups: [...groupsByYear.entries()].map(([title, links]) => ({
      title,
      links,
    })),
  }
}

export default ((opts?: AutoIndexOptions) => {
  const options = normalizedOptions(opts)

  const AutoIndexFolder: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
    const pages = collectAutoIndexPages(allFiles, options)
    const intro = options.showDescriptionIntro ? fileData.description : undefined

    return (
      <div class={`popover-hint ${options.classPrefix}-index`}>
        {intro && (
          <section class={`${options.classPrefix}-index-intro`}>
            <p>{intro}</p>
          </section>
        )}
        <div class={`${options.classPrefix}-card-list`}>
          {pages.map((page) => {
            const title = page.frontmatter?.title ?? page.slug ?? "Untitled"
            const href = resolveRelative(fileData.slug!, page.slug)
            const author = getAutoIndexAuthorLabel(page, options.defaultAuthor)
            const date = pageDateValue(page)

            return (
              <article class={`${options.classPrefix}-card`}>
                <a href={href} class={`${options.classPrefix}-card-link`}>
                  <div class={`${options.classPrefix}-card-head`}>
                    <h2>{title}</h2>
                    <p class={`${options.classPrefix}-card-meta`}>
                      <span class={`${options.classPrefix}-card-author`}>{author}</span>
                      {date && (
                        <>
                          <span class={`${options.classPrefix}-card-meta-separator`}>/</span>
                          <span class={`${options.classPrefix}-card-date`}>
                            {formatPageDate(date)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <p class={`${options.classPrefix}-card-description`}>
                    {getPageDescription(page, options.emptyDescription)}
                  </p>
                </a>
              </article>
            )
          })}
        </div>
      </div>
    )
  }

  return AutoIndexFolder
}) satisfies QuartzComponentConstructor<AutoIndexOptions>
