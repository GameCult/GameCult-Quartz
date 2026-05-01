import { FullSlug, joinSegments, simplifySlug } from "./path"

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
