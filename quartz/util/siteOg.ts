import { QuartzPluginData } from "../plugins/vfile"
import { mergeHierarchicalSocialMetadata, socialMetadataSlug } from "./siteSocialOverrides"

export type SocialImageRef =
  | {
      kind: "static"
      path: string
      alt?: string
    }
  | {
      kind: "relative"
      path: string
      alt?: string
    }
  | {
      kind: "absolute"
      path: string
      alt?: string
    }

export type SiteSocialMetadata = {
  section?: string
  deck?: string
  image?: SocialImageRef
}

const siteSocialMetadata: SiteSocialMetadata = {}
const siteSocialMetadataOverrides: Record<string, SiteSocialMetadata> = {}

export function resolveSiteSocialMetadata(fileData: QuartzPluginData): SiteSocialMetadata {
  return mergeHierarchicalSocialMetadata(
    siteSocialMetadata,
    socialMetadataSlug(fileData),
    siteSocialMetadataOverrides,
  )
}
