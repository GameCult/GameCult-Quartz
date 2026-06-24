import { QuartzPluginData } from "../plugins/vfile"

export function socialMetadataSlug(fileData: QuartzPluginData): string {
  return typeof fileData.slug === "string" ? fileData.slug : "index"
}

export function findHierarchicalSocialMetadata<T>(
  slug: string,
  overrides: Record<string, T>,
): T | undefined {
  return Object.entries(overrides)
    .filter(([prefix]) => slug === prefix || slug.startsWith(`${prefix}/`))
    .sort(([left], [right]) => right.length - left.length)[0]?.[1]
}

export function mergeHierarchicalSocialMetadata<T extends object>(
  baseMetadata: T,
  slug: string,
  overrides: Record<string, Partial<T>>,
): T {
  const matchingOverride = findHierarchicalSocialMetadata(slug, overrides)
  return matchingOverride ? { ...baseMetadata, ...matchingOverride } : baseMetadata
}
