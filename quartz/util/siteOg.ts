import { QuartzPluginData } from "../plugins/vfile"

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

export function resolveSiteSocialMetadata(_fileData: QuartzPluginData): SiteSocialMetadata {
  return {}
}
