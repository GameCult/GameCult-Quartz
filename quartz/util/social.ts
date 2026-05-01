import path from "node:path"
import { Element, Root as HtmlRoot, RootContent } from "hast"
import { toString } from "hast-util-to-string"
import { QuartzPluginData } from "../plugins/vfile"
import { FullSlug, QUARTZ, joinSegments, simplifySlug } from "./path"
import { SiteSocialMetadata, SocialImageRef, resolveSiteSocialMetadata } from "./siteOg"

const taglinePattern = /^["'\u201C\u2018].+["'\u201D\u2019]$/u

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function isElementNode(node: RootContent): node is Element {
  return node.type === "element"
}

function isWhitespaceText(node: RootContent) {
  return node.type === "text" && node.value.trim().length === 0
}

function stripSurroundingQuotes(value: string) {
  return value
    .replace(/^["'\u201C\u2018]+/u, "")
    .replace(/["'\u201D\u2019]+$/u, "")
    .trim()
}

function isStandaloneTagline(node: RootContent) {
  if (!isElementNode(node) || node.tagName !== "p") {
    return false
  }

  const meaningfulChildren = node.children.filter((child) => !isWhitespaceText(child))
  if (meaningfulChildren.length !== 1) {
    return false
  }

  const child = meaningfulChildren[0]
  if (!isElementNode(child) || !["em", "strong"].includes(child.tagName)) {
    return false
  }

  return taglinePattern.test(normalizeWhitespace(toString(child)))
}

function extractTopTagline(root?: HtmlRoot): string | undefined {
  if (!root) {
    return undefined
  }

  let titleSkipped = false

  for (const node of root.children) {
    if (!isElementNode(node)) {
      continue
    }

    if (!titleSkipped && node.tagName === "h1") {
      titleSkipped = true
      continue
    }

    const text = normalizeWhitespace(toString(node))
    if (text.length === 0) {
      continue
    }

    if (isStandaloneTagline(node)) {
      return stripSurroundingQuotes(text)
    }

    return undefined
  }

  return undefined
}

function extractFirstImage(root?: HtmlRoot): SocialImageRef | undefined {
  if (!root) {
    return undefined
  }

  const queue: RootContent[] = [...root.children]

  while (queue.length > 0) {
    const node = queue.shift()
    if (!node || !isElementNode(node)) {
      continue
    }

    if (node.tagName === "img" && typeof node.properties?.src === "string") {
      const src = node.properties.src.trim()
      const alt =
        typeof node.properties.alt === "string" && node.properties.alt.trim().length > 0
          ? node.properties.alt.trim()
          : undefined

      if (/^https?:\/\//i.test(src)) {
        return {
          kind: "absolute",
          path: src,
          alt,
        }
      }

      return {
        kind: "relative",
        path: src,
        alt,
      }
    }

    queue.unshift(...node.children)
  }

  return undefined
}

export function canonicalSocialUrl(baseUrl: string, slug?: FullSlug): string {
  const rootUrl = `https://${baseUrl}`
  return slug ? joinSegments(rootUrl, simplifySlug(slug)) : rootUrl
}

export function normalizeSocialDescription(description: string, maxLength = 220): string {
  const normalized = description.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  const softCut = normalized.slice(0, maxLength + 1)
  const boundary = softCut.lastIndexOf(" ")
  const truncated =
    boundary > Math.floor(maxLength * 0.6)
      ? softCut.slice(0, boundary)
      : normalized.slice(0, maxLength)

  return truncated.replace(/[.,;:\s]+$/g, "") + "..."
}

export function resolveSocialDescription(fileData: QuartzPluginData, fallback: string): string {
  return normalizeSocialDescription(
    fileData.frontmatter?.socialDescription ??
      fileData.frontmatter?.description ??
      fileData.description?.trim() ??
      fallback,
  )
}

export function resolveSocialMetadata(fileData: QuartzPluginData): SiteSocialMetadata {
  return resolveSiteSocialMetadata(fileData)
}

export function resolveSocialDeck(
  fileData: QuartzPluginData,
  description: string,
  siteMetadata = resolveSiteSocialMetadata(fileData),
): string {
  const explicitDeck = fileData.frontmatter?.socialDeck
  if (typeof explicitDeck === "string" && explicitDeck.trim().length > 0) {
    return explicitDeck.trim()
  }

  if (siteMetadata.deck && siteMetadata.deck.trim().length > 0) {
    return siteMetadata.deck.trim()
  }

  const tagline = extractTopTagline(fileData.htmlAst)
  if (tagline) {
    return tagline
  }

  return description
}

export function resolveSocialSection(
  fileData: QuartzPluginData,
  siteMetadata = resolveSiteSocialMetadata(fileData),
): string {
  if (
    typeof fileData.frontmatter?.socialSection === "string" &&
    fileData.frontmatter.socialSection
  ) {
    return fileData.frontmatter.socialSection.trim()
  }

  if (siteMetadata.section && siteMetadata.section.trim().length > 0) {
    return siteMetadata.section.trim()
  }

  return ""
}

export function resolveSocialImage(
  fileData: QuartzPluginData,
  siteMetadata = resolveSiteSocialMetadata(fileData),
): SocialImageRef | undefined {
  const explicitImage = fileData.frontmatter?.socialImage
  if (typeof explicitImage === "string" && explicitImage.trim().length > 0) {
    const imagePath = explicitImage.trim()
    return /^https?:\/\//i.test(imagePath)
      ? { kind: "absolute", path: imagePath }
      : { kind: "static", path: imagePath }
  }

  return extractFirstImage(fileData.htmlAst) ?? siteMetadata.image
}

export function socialImageUrl(
  baseUrl: string,
  fileData: QuartzPluginData,
  image?: SocialImageRef,
): string | undefined {
  if (!image) {
    return undefined
  }

  switch (image.kind) {
    case "absolute":
      return image.path
    case "static":
      return `https://${baseUrl}/static/${image.path.replace(/^\/+/, "")}`
    case "relative":
      return new URL(image.path, canonicalSocialUrl(baseUrl, fileData.slug)).toString()
  }
}

export function socialImageLocalPath(
  fileData: QuartzPluginData,
  image?: SocialImageRef,
): string | undefined {
  if (!image) {
    return undefined
  }

  switch (image.kind) {
    case "absolute":
      return undefined
    case "static":
      return path.join(QUARTZ, "static", image.path.replace(/^[/\\]+/, ""))
    case "relative":
      return fileData.filePath
        ? path.resolve(path.dirname(fileData.filePath), image.path)
        : undefined
  }
}
