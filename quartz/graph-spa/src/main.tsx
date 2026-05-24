import React from "react"
import { flushSync } from "react-dom"
import ReactDOM from "react-dom/client"
import { EpiphanyGraphViewer } from "../../../../EpiphanyGraph/web/epiphany-graph-viewer/src/lib/EpiphanyGraphViewer"
import type {
  EpiphanyGraphEdge,
  EpiphanyGraphNode,
  EpiphanyGraphsState,
  GraphKey,
  PositionedNode,
  ViewerSelection,
} from "../../../../EpiphanyGraph/web/epiphany-graph-viewer/src/lib/types"
import "./styles.css"

type QuartzContentEntry = {
  slug: string
  filePath?: string
  title?: string
  links?: string[]
  tags?: string[]
  content?: string
}

type QuartzContentIndex = Record<string, QuartzContentEntry>

type ArticleState =
  | {
      status: "idle"
      html: string | null
    }
  | {
      status: "loading"
      html: string | null
    }
  | {
      status: "ready"
      html: string
    }
  | {
      status: "error"
      html: string | null
      message: string
    }

declare global {
  interface Window {
    fetchData?: Promise<QuartzContentIndex>
  }
}

type GraphErrorBoundaryState = {
  error: Error | null
}

class GraphErrorBoundary extends React.Component<React.PropsWithChildren, GraphErrorBoundaryState> {
  state: GraphErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <pre className="gamecult-graph-error">
          {this.state.error.message}
          {"\n"}
          {this.state.error.stack}
        </pre>
      )
    }

    return this.props.children
  }
}

const SECTION_ORDER = [
  "World",
  "Ecology",
  "Species",
  "Civilizations",
  "Technologies",
  "Conflicts",
  "Themes",
  "Root",
]

function entryTitle(slug: string, entry?: QuartzContentEntry) {
  if (entry?.title) {
    return entry.title
  }

  return slug
    .split("/")
    .at(-1)!
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function normalizeSlug(slug: string) {
  if (slug.endsWith("/")) {
    return `${slug.slice(0, -1)}/index`
  }

  return slug
}

function sectionForSlug(slug: string) {
  return slug.includes("/") ? slug.split("/")[0] : "Root"
}

function slugToArticleUrl(slug: string) {
  if (slug === "index") {
    return "/index.html"
  }

  return `/${slug.split("/").map(encodeURIComponent).join("/")}.html`
}

function slugFromArticleUrl(url: string, slugs: Set<string>) {
  const parsed = new URL(url, window.location.href)

  if (parsed.origin !== window.location.origin) {
    return null
  }

  const decodedPath = decodeURIComponent(parsed.pathname)
    .replace(/^\//, "")
    .replace(/\.html$/, "")
    .replace(/\/$/, "/index")
  const slug = normalizeSlug(decodedPath || "index")

  return slugs.has(slug) ? slug : null
}

function parseHashSelection(slugs: Set<string>): ViewerSelection | null {
  const match = window.location.hash.match(/^#note=(.+)$/)

  if (!match) {
    return null
  }

  const slug = normalizeSlug(decodeURIComponent(match[1]))

  if (!slugs.has(slug)) {
    return null
  }

  return {
    kind: "node",
    graphKey: "architecture",
    nodeId: slug,
  }
}

function currentRouteSelection(slugs: Set<string>): ViewerSelection | null {
  const bodySlug = document.body.dataset.slug
  const pathSlug = decodeURIComponent(window.location.pathname)
    .replace(/^\//, "")
    .replace(/\.html$/, "")
    .replace(/\/$/, "/index")
  const slug = normalizeSlug(bodySlug || pathSlug || "index")

  if (!slugs.has(slug)) {
    return null
  }

  return {
    kind: "node",
    graphKey: "architecture",
    nodeId: slug,
  }
}

function compareSections(left: string, right: string) {
  const leftIndex = SECTION_ORDER.indexOf(left)
  const rightIndex = SECTION_ORDER.indexOf(right)

  if (leftIndex !== -1 || rightIndex !== -1) {
    const orderedLeft = leftIndex === -1 ? SECTION_ORDER.length : leftIndex
    const orderedRight = rightIndex === -1 ? SECTION_ORDER.length : rightIndex

    return orderedLeft - orderedRight
  }

  return left.localeCompare(right)
}

function summarizeContent(entry: QuartzContentEntry) {
  const text = (entry.content ?? "")
    .replace(/\s+/g, " ")
    .replace(/^Table of contents\s*/i, "")
    .trim()

  if (!text) {
    return `Vault note at ${entry.filePath ?? entry.slug}.`
  }

  const sentenceEnd = text.search(/[.!?](\s|$)/)
  const sentence = sentenceEnd >= 0 ? text.slice(0, sentenceEnd + 1) : text

  if (sentence.length <= 220) {
    return sentence
  }

  return `${sentence.slice(0, 217).trim()}...`
}

function validLinkedSlugs(entry: QuartzContentEntry, slugs: Set<string>) {
  return (entry.links ?? [])
    .map(normalizeSlug)
    .filter(
      (targetSlug, index, links) => slugs.has(targetSlug) && links.indexOf(targetSlug) === index,
    )
}

function buildIncomingLinks(entries: Array<[string, QuartzContentEntry]>, slugs: Set<string>) {
  const incoming = new Map<string, string[]>()

  for (const [slug] of entries) {
    incoming.set(slug, [])
  }

  for (const [sourceSlug, entry] of entries) {
    for (const targetSlug of validLinkedSlugs(entry, slugs)) {
      incoming.get(targetSlug)?.push(sourceSlug)
    }
  }

  return incoming
}

function buildSectionEdges(entries: Array<[string, QuartzContentEntry]>, slugs: Set<string>) {
  const edgeCounts = new Map<string, number>()

  for (const [sourceSlug, entry] of entries) {
    const sourceSection = sectionForSlug(sourceSlug)

    for (const targetSlug of validLinkedSlugs(entry, slugs)) {
      const targetSection = sectionForSlug(targetSlug)
      const edgeId = `${sourceSection}->${targetSection}`
      edgeCounts.set(edgeId, (edgeCounts.get(edgeId) ?? 0) + 1)
    }
  }

  return Array.from(edgeCounts.entries()).map(([edgeId, count]) => {
    const [sourceSection, targetSection] = edgeId.split("->")

    return {
      id: `section:${edgeId}`,
      source_id: `section:${sourceSection}`,
      target_id: `section:${targetSection}`,
      kind: sourceSection === targetSection ? "internal_links" : "cross_links",
      label: `${count} ${count === 1 ? "link" : "links"}`,
      mechanism:
        sourceSection === targetSection
          ? `${count} wiki ${count === 1 ? "link stays" : "links stay"} inside ${sourceSection}.`
          : `${count} wiki ${count === 1 ? "link runs" : "links run"} from ${sourceSection} into ${targetSection}.`,
    } satisfies EpiphanyGraphEdge
  })
}

function buildGraphState(contentIndex: QuartzContentIndex): EpiphanyGraphsState {
  const entries = Object.entries(contentIndex)
    .map(([slug, entry]) => {
      const normalizedSlug = normalizeSlug(entry.slug || slug)

      return [normalizedSlug, { ...entry, slug: normalizedSlug }] as [string, QuartzContentEntry]
    })
    .filter(([slug]) => !slug.startsWith("Inspirations/"))
    .sort(([left], [right]) => left.localeCompare(right))

  const entryBySlug = new Map(entries)
  const slugs = new Set(entries.map(([slug]) => slug))
  const incoming = buildIncomingLinks(entries, slugs)

  const architectureNodes: EpiphanyGraphNode[] = entries.map(([slug, entry]) => {
    const outgoingCount = validLinkedSlugs(entry, slugs).length
    const backlinkCount = incoming.get(slug)?.length ?? 0

    return {
      id: slug,
      title: entryTitle(slug, entry),
      status: backlinkCount > 0 ? "linked" : "source",
      purpose: summarizeContent(entry),
      mechanism: `${outgoingCount} outgoing wiki ${outgoingCount === 1 ? "link" : "links"}; ${backlinkCount} incoming ${backlinkCount === 1 ? "backlink" : "backlinks"}. Folder: ${sectionForSlug(slug)}.`,
      metaphor: entry.filePath ?? slug,
    }
  })

  const architectureEdges: EpiphanyGraphEdge[] = entries.flatMap(([sourceSlug, entry]) =>
    validLinkedSlugs(entry, slugs).map((targetSlug, index) => ({
      id: `${sourceSlug}->${targetSlug}:${index}`,
      source_id: sourceSlug,
      target_id: targetSlug,
      kind: "wiki_link",
      label: "links to",
      mechanism: `${entryTitle(sourceSlug, entry)} links to ${entryTitle(targetSlug, entryBySlug.get(targetSlug))}.`,
    })),
  )

  const sections = Array.from(new Set(entries.map(([slug]) => sectionForSlug(slug)))).sort(
    compareSections,
  )
  const dataflowNodes: EpiphanyGraphNode[] = sections.map((section) => {
    const sectionEntries = entries.filter(([slug]) => sectionForSlug(slug) === section)
    const sectionSlugs = new Set(sectionEntries.map(([slug]) => slug))
    const outgoingCrossSection = sectionEntries.reduce((count, [, entry]) => {
      return (
        count +
        validLinkedSlugs(entry, slugs).filter((targetSlug) => !sectionSlugs.has(targetSlug)).length
      )
    }, 0)
    const incomingCrossSection = entries.reduce((count, [sourceSlug, entry]) => {
      if (sectionForSlug(sourceSlug) === section) {
        return count
      }

      return (
        count +
        validLinkedSlugs(entry, slugs).filter((targetSlug) => sectionSlugs.has(targetSlug)).length
      )
    }, 0)

    return {
      id: `section:${section}`,
      title: section,
      status: "active",
      purpose: `${sectionEntries.length} ${sectionEntries.length === 1 ? "note" : "notes"} in this vault section.`,
      mechanism: `${outgoingCrossSection} outgoing cross-section ${outgoingCrossSection === 1 ? "link" : "links"}; ${incomingCrossSection} incoming cross-section ${incomingCrossSection === 1 ? "backlink" : "backlinks"}.`,
      metaphor: "Quartz backlink cluster",
    }
  })

  return {
    architecture: {
      nodes: architectureNodes,
      edges: architectureEdges,
    },
    dataflow: {
      nodes: dataflowNodes,
      edges: buildSectionEdges(entries, slugs),
    },
    links: entries.map(([slug]) => ({
      architecture_node_id: slug,
      dataflow_node_id: `section:${sectionForSlug(slug)}`,
      relationship: "section membership",
    })),
  }
}

async function loadGraphState() {
  const contentIndex = window.fetchData
    ? await window.fetchData
    : await fetch("/static/contentIndex.json").then(
        (response) => response.json() as Promise<QuartzContentIndex>,
      )

  return {
    contentIndex,
    graphState: buildGraphState(contentIndex),
  }
}

async function loadArticleHtml(slug: string) {
  const response = await fetch(slugToArticleUrl(slug))

  if (!response.ok) {
    throw new Error(`Could not load ${slug}: ${response.status}`)
  }

  const html = await response.text()
  const documentHtml = new DOMParser().parseFromString(html, "text/html")
  const article = documentHtml.querySelector("article")

  if (!article) {
    throw new Error(`No article body found for ${slug}`)
  }

  const articleUrl = new URL(slugToArticleUrl(slug), window.location.href)

  article.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    anchor.href = new URL(anchor.getAttribute("href") ?? "", articleUrl).toString()
  })

  article.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    image.src = new URL(image.getAttribute("src") ?? "", articleUrl).toString()
  })

  return article.innerHTML
}

function selectedNoteSlug(selection: ViewerSelection | null) {
  return selection?.kind === "node" && selection.graphKey === "architecture"
    ? selection.nodeId
    : null
}

function App() {
  const [graphState, setGraphState] = React.useState<EpiphanyGraphsState | null>(null)
  const [contentIndex, setContentIndex] = React.useState<QuartzContentIndex | null>(null)
  const [selection, setSelection] = React.useState<ViewerSelection | null>(null)
  const [viewportTarget, setViewportTarget] = React.useState<ViewerSelection | null>(null)
  const [articleCache, setArticleCache] = React.useState<Record<string, ArticleState>>({})
  const [error, setError] = React.useState<Error | null>(null)
  const articleCacheRef = React.useRef<Record<string, ArticleState>>({})
  const loadingArticlesRef = React.useRef<Set<string>>(new Set())
  const slugs = React.useMemo(
    () => new Set(Object.keys(contentIndex ?? {}).map(normalizeSlug)),
    [contentIndex],
  )
  const noteSlug = selectedNoteSlug(selection)

  React.useEffect(() => {
    articleCacheRef.current = articleCache
  }, [articleCache])

  React.useEffect(() => {
    document.body.classList.add("gamecult-graph-spa-active")

    return () => {
      document.body.classList.remove("gamecult-graph-spa-active")
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    loadGraphState()
      .then(({ contentIndex: nextContentIndex, graphState: nextGraphState }) => {
        if (!cancelled) {
          const nextSlugs = new Set(Object.keys(nextContentIndex).map(normalizeSlug))
          const initialViewportTarget = parseHashSelection(nextSlugs) ??
            currentRouteSelection(nextSlugs) ?? {
              kind: "node" as const,
              graphKey: "architecture" as const,
              nodeId: nextSlugs.has("index")
                ? "index"
                : (nextGraphState.architecture.nodes[0]?.id ?? ""),
            }
          setContentIndex(nextContentIndex)
          setGraphState(nextGraphState)
          setViewportTarget(initialViewportTarget)
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught : new Error(String(caught)))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const ensureArticle = React.useCallback((slug: string) => {
    const current = articleCacheRef.current[slug]

    if (current?.status === "ready" || loadingArticlesRef.current.has(slug)) {
      return
    }

    loadingArticlesRef.current.add(slug)
    setArticleCache((currentCache) => ({
      ...currentCache,
      [slug]: { status: "loading", html: currentCache[slug]?.html ?? null },
    }))

    loadArticleHtml(slug)
      .then((html) => {
        loadingArticlesRef.current.delete(slug)
        setArticleCache((currentCache) => ({
          ...currentCache,
          [slug]: { status: "ready", html },
        }))
      })
      .catch((caught) => {
        loadingArticlesRef.current.delete(slug)
        setArticleCache((currentCache) => ({
          ...currentCache,
          [slug]: {
            status: "error",
            html: null,
            message: caught instanceof Error ? caught.message : String(caught),
          },
        }))
      })
  }, [])

  React.useEffect(() => {
    if (noteSlug) {
      ensureArticle(noteSlug)
    }
  }, [ensureArticle, noteSlug])

  React.useEffect(() => {
    if (!noteSlug) {
      return
    }

    window.history.replaceState(null, "", `#note=${encodeURIComponent(noteSlug)}`)
  }, [noteSlug])

  React.useEffect(() => {
    const onHashChange = () => {
      const hashSelection = parseHashSelection(slugs)

      if (hashSelection) {
        setViewportTarget(hashSelection)
      }
    }

    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [slugs])

  const selectNote = React.useCallback(
    (slug: string) =>
      setViewportTarget({
        kind: "node",
        graphKey: "architecture",
        nodeId: slug,
      }),
    [],
  )

  const onViewportTargetComplete = React.useCallback(() => {
    setViewportTarget(null)
  }, [])

  const onArticleLinkClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const anchor = (event.target as HTMLElement).closest("a[href]")

      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      const slug = slugFromArticleUrl(anchor.href, slugs)

      if (!slug) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      selectNote(slug)
    },
    [selectNote, slugs],
  )

  if (error) {
    return (
      <pre className="gamecult-graph-error">
        {error.message}
        {"\n"}
        {error.stack}
      </pre>
    )
  }

  if (!graphState) {
    return (
      <main className="gamecult-epiphany-graph-app">
        <div className="gamecult-graph-loading">Loading Quartz backlink graph...</div>
      </main>
    )
  }

  return (
    <main className="gamecult-epiphany-graph-app">
      <GraphErrorBoundary>
        <EpiphanyGraphViewer
          state={graphState}
          title="GameCult Knowledge Graph"
          selection={selection}
          viewportTarget={viewportTarget}
          onViewportTargetComplete={onViewportTargetComplete}
          onSelectionChange={setSelection}
          overlayPanels
          className="gamecult-graph-shell"
          showSidebar={false}
          focusSelection
          selectionFocusMode="article"
          onExpandedNodeClick={onArticleLinkClick}
          nodeArticle={{
            className: "gamecult-expanded-article-node",
            ariaLabel: (node) => `${node.title} article node`,
            content: (node) => (
              <ViewportNodeArticle
                node={node}
                articleCache={articleCache}
                contentIndex={contentIndex}
                ensureArticle={ensureArticle}
                onSelectNote={selectNote}
                onArticleLinkClick={onArticleLinkClick}
              />
            ),
          }}
          graphLabels={{
            architecture: "Notes",
            dataflow: "Sections",
          }}
          graphDescriptions={{
            architecture:
              "Notes are individual vault pages from the gamecult knowledge base. Their edges are Quartz wiki links, with incoming backlinks counted into each node.",
            dataflow:
              "Sections are folder-level clusters. Their edges summarize how links and backlinks move between regions of the vault.",
          }}
          layoutMode={{
            architecture: "combined-force",
            dataflow: "combined-force",
          }}
        />
      </GraphErrorBoundary>
    </main>
  )
}

function ViewportNodeArticle({
  node,
  articleCache,
  contentIndex,
  ensureArticle,
  onSelectNote,
  onArticleLinkClick,
}: {
  node: PositionedNode
  articleCache: Record<string, ArticleState>
  contentIndex: QuartzContentIndex | null
  ensureArticle: (slug: string) => void
  onSelectNote: (slug: string) => void
  onArticleLinkClick: (event: React.MouseEvent<HTMLElement>) => void
}) {
  const noteSlug = node.graphKey === "architecture" ? node.id : null
  const section = node.graphKey === "dataflow" ? node.id.replace(/^section:/, "") : null

  React.useEffect(() => {
    if (noteSlug) {
      ensureArticle(noteSlug)
    }
  }, [ensureArticle, noteSlug])

  return (
    <ArticlePanel
      articleState={
        noteSlug
          ? (articleCache[noteSlug] ?? { status: "idle", html: null })
          : { status: "idle", html: null }
      }
      contentIndex={contentIndex}
      noteSlug={noteSlug}
      section={section}
      onSelectNote={onSelectNote}
      onArticleLinkClick={onArticleLinkClick}
    />
  )
}

function ArticlePanel({
  articleState,
  contentIndex,
  noteSlug,
  section,
  onSelectNote,
  onArticleLinkClick,
}: {
  articleState: ArticleState
  contentIndex: QuartzContentIndex | null
  noteSlug: string | null
  section: string | null
  onSelectNote: (slug: string) => void
  onArticleLinkClick: (event: React.MouseEvent<HTMLElement>) => void
}) {
  const note = noteSlug && contentIndex ? contentIndex[noteSlug] : null
  const sectionNotes = React.useMemo(() => {
    if (!section || !contentIndex) {
      return []
    }

    return Object.entries(contentIndex)
      .map(
        ([slug, entry]) =>
          [normalizeSlug(entry.slug || slug), entry] as [string, QuartzContentEntry],
      )
      .filter(([slug]) => sectionForSlug(slug) === section)
      .sort(([left, leftEntry], [right, rightEntry]) =>
        entryTitle(left, leftEntry).localeCompare(entryTitle(right, rightEntry)),
      )
  }, [contentIndex, section])

  if (section) {
    return (
      <article className="gamecult-spa-panel">
        <header className="gamecult-spa-article-header">
          <span className="gamecult-spa-node-badge" aria-hidden="true">
            {initialsForTitle(section)}
          </span>
          <span className="gamecult-spa-title-cluster">
            <p className="gamecult-spa-kicker">Section Cluster</p>
            <h1>{section}</h1>
          </span>
        </header>
        <p className="gamecult-spa-summary">
          {sectionNotes.length} notes live in this section. Pick one and the graph becomes the table
          of contents it was clearly auditioning to be.
        </p>
        <div className="gamecult-spa-note-list">
          {sectionNotes.map(([slug, entry]) => (
            <button key={slug} type="button" onClick={() => onSelectNote(slug)}>
              <strong>{entryTitle(slug, entry)}</strong>
              <span>{summarizeContent(entry)}</span>
            </button>
          ))}
        </div>
      </article>
    )
  }

  if (!noteSlug || !note) {
    return (
      <article className="gamecult-spa-panel">
        <header className="gamecult-spa-article-header">
          <span className="gamecult-spa-node-badge" aria-hidden="true">
            GC
          </span>
          <span className="gamecult-spa-title-cluster">
            <p className="gamecult-spa-kicker">Graph Atlas</p>
            <h1>gamecult</h1>
          </span>
        </header>
        <p className="gamecult-spa-summary">
          Select a note to read it here. The graph is the site map now, which is probably what it
          was trying to confess.
        </p>
      </article>
    )
  }

  return (
    <article className="gamecult-spa-panel">
      <header className="gamecult-spa-article-header">
        <span className="gamecult-spa-node-badge" aria-hidden="true">
          {initialsForTitle(entryTitle(noteSlug, note))}
        </span>
        <span className="gamecult-spa-title-cluster">
          <p className="gamecult-spa-kicker">{sectionForSlug(noteSlug)}</p>
          <h1>{entryTitle(noteSlug, note)}</h1>
        </span>
      </header>
      {articleState.status === "loading" && (
        <div className="gamecult-spa-status">Loading article...</div>
      )}
      {articleState.status === "error" && (
        <div className="gamecult-spa-status gamecult-spa-status-error">{articleState.message}</div>
      )}
      {articleState.status === "ready" && (
        <div
          className="gamecult-spa-article"
          data-epiphany-article-content
          onClick={onArticleLinkClick}
          dangerouslySetInnerHTML={{ __html: articleState.html }}
        />
      )}
      {articleState.status !== "ready" && articleState.html && (
        <div
          className="gamecult-spa-article"
          data-epiphany-article-content
          onClick={onArticleLinkClick}
          dangerouslySetInnerHTML={{ __html: articleState.html }}
        />
      )}
    </article>
  )
}

function initialsForTitle(title: string) {
  const words = title
    .replace(/['’]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

  if (words.length === 0) {
    return "GC"
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}

function mountGameCultGraph() {
  document.querySelectorAll(".gamecult-epiphany-graph-root").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return
    }

    if (element.dataset.ready === "true" && element.childElementCount > 0) {
      return
    }

    const root = ReactDOM.createRoot(element)
    flushSync(() => {
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      )
    })
    element.dataset.ready = "true"
  })
}

function scheduleGameCultGraphMount() {
  mountGameCultGraph()
  window.setTimeout(mountGameCultGraph, 50)
  window.setTimeout(mountGameCultGraph, 300)
  window.setTimeout(mountGameCultGraph, 1000)
  window.setTimeout(mountGameCultGraph, 2000)
}

document.addEventListener("nav", scheduleGameCultGraphMount)
document.addEventListener("DOMContentLoaded", scheduleGameCultGraphMount)
scheduleGameCultGraphMount()
