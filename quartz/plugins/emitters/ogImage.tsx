import { QuartzEmitterPlugin } from "../types"
import { i18n } from "../../i18n"
import { unescapeHTML } from "../../util/escape"
import { FullSlug, getFileExtension, isAbsoluteURL, joinSegments, QUARTZ } from "../../util/path"
import { ImageOptions, SocialImageOptions, defaultImage, getSatoriFonts } from "../../util/og"
import sharp from "sharp"
import satori, { SatoriOptions } from "satori"
import { loadEmoji, getIconCode } from "../../util/emoji"
import { Readable } from "stream"
import { write } from "./helpers"
import { BuildCtx } from "../../util/ctx"
import { QuartzPluginData } from "../vfile"
import fs from "node:fs/promises"
import { styleText } from "util"
import {
  resolveSocialDeck,
  resolveSocialDescription,
  resolveSocialImage,
  resolveSocialMetadata,
  resolveSocialSection,
  socialImageLocalPath,
  socialImageUrl,
} from "../../util/social"

const defaultOptions: SocialImageOptions = {
  colorScheme: "lightMode",
  width: 1200,
  height: 630,
  imageStructure: defaultImage,
  excludeRoot: false,
}

function imageMimeType(filePath: string) {
  const normalizedPath = isAbsoluteURL(filePath) ? new URL(filePath).pathname : filePath
  const extension = getFileExtension(normalizedPath)?.replace(/^\./, "").toLowerCase()
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    default:
      return "image/png"
  }
}

/**
 * Generates social image (OG/twitter standard) and saves it as `.webp` inside the public folder
 * @param opts options for generating image
 */
async function generateSocialImage(
  { cfg, description, deck, section, fonts, title, fileData }: ImageOptions,
  userOpts: SocialImageOptions,
): Promise<Readable> {
  const { width, height } = userOpts
  const iconPath = joinSegments(QUARTZ, "static", "icon.png")
  let iconBase64: string | undefined = undefined
  let imageBase64: string | undefined = undefined
  try {
    const iconData = await fs.readFile(iconPath)
    iconBase64 = `data:image/png;base64,${iconData.toString("base64")}`
  } catch (err) {
    console.warn(styleText("yellow", `Warning: Could not find icon at ${iconPath}`))
  }

  const socialMetadata = resolveSocialMetadata(fileData)
  const socialImage = resolveSocialImage(fileData, socialMetadata)
  const localImagePath = socialImageLocalPath(fileData, socialImage)

  if (localImagePath) {
    try {
      const imageData = await fs.readFile(localImagePath)
      const normalizedImageData = await sharp(imageData)
        .resize(width, height, {
          fit: "cover",
          position: "attention",
        })
        .png({ compressionLevel: 9 })
        .toBuffer()
      imageBase64 = `data:image/png;base64,${normalizedImageData.toString("base64")}`
    } catch (err) {
      console.warn(styleText("yellow", `Warning: Could not load social image at ${localImagePath}`))
    }
  }

  const imageComponent = userOpts.imageStructure({
    cfg,
    userOpts,
    title,
    description,
    deck,
    section,
    fonts,
    fileData,
    iconBase64,
    imageBase64,
  })

  const svg = await satori(imageComponent, {
    width,
    height,
    fonts,
    loadAdditionalAsset: async (languageCode: string, segment: string) => {
      if (languageCode === "emoji") {
        return await loadEmoji(getIconCode(segment))
      }

      return languageCode
    },
  })

  return sharp(Buffer.from(svg)).webp({ quality: 40 })
}

async function processOgImage(
  ctx: BuildCtx,
  fileData: QuartzPluginData,
  fonts: SatoriOptions["fonts"],
  fullOptions: SocialImageOptions,
) {
  const cfg = ctx.cfg.configuration
  const slug = fileData.slug!
  const titleSuffix = cfg.pageTitleSuffix ?? ""
  const title =
    (fileData.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title) + titleSuffix
  const description = resolveSocialDescription(
    fileData,
    unescapeHTML(i18n(cfg.locale).propertyDefaults.description),
  )
  const siteMetadata = resolveSocialMetadata(fileData)
  const deck = resolveSocialDeck(fileData, description, siteMetadata)
  const section = resolveSocialSection(fileData, siteMetadata)

  const stream = await generateSocialImage(
    {
      title,
      description,
      deck,
      section,
      fonts,
      cfg,
      fileData,
    },
    fullOptions,
  )

  return write({
    ctx,
    content: stream,
    slug: `${slug}-og-image` as FullSlug,
    ext: ".webp",
  })
}

export const CustomOgImagesEmitterName = "CustomOgImages"
export const CustomOgImages: QuartzEmitterPlugin<Partial<SocialImageOptions>> = (userOpts) => {
  const fullOptions = { ...defaultOptions, ...userOpts }

  return {
    name: CustomOgImagesEmitterName,
    getQuartzComponents() {
      return []
    },
    async *emit(ctx, content, _resources) {
      const cfg = ctx.cfg.configuration
      const headerFont = cfg.theme.typography.header
      const bodyFont = cfg.theme.typography.body
      const fonts = await getSatoriFonts(headerFont, bodyFont)

      for (const [_tree, vfile] of content) {
        if (fullOptions.excludeRoot && vfile.data.slug === "index") continue
        yield processOgImage(ctx, vfile.data, fonts, fullOptions)
      }
    },
    async *partialEmit(ctx, _content, _resources, changeEvents) {
      const cfg = ctx.cfg.configuration
      const headerFont = cfg.theme.typography.header
      const bodyFont = cfg.theme.typography.body
      const fonts = await getSatoriFonts(headerFont, bodyFont)

      // find all slugs that changed or were added
      for (const changeEvent of changeEvents) {
        if (!changeEvent.file) continue
        if (fullOptions.excludeRoot && changeEvent.file.data.slug === "index") continue
        if (changeEvent.type === "add" || changeEvent.type === "change") {
          yield processOgImage(ctx, changeEvent.file.data, fonts, fullOptions)
        }
      }
    },
    externalResources: (ctx) => {
      if (!ctx.cfg.configuration.baseUrl) {
        return {}
      }

      const baseUrl = ctx.cfg.configuration.baseUrl
      return {
        additionalHead: [
          (pageData) => {
            const isRealFile = pageData.filePath !== undefined
            const useGeneratedCard =
              isRealFile && !(fullOptions.excludeRoot && pageData.slug === "index")
            const generatedOgImagePath = useGeneratedCard
              ? `https://${baseUrl}/${pageData.slug!}-og-image.webp`
              : undefined
            const pageSiteMetadata = resolveSocialMetadata(pageData)
            const pageSocialImage = resolveSocialImage(pageData, pageSiteMetadata)
            const imageFromMetadata = socialImageUrl(baseUrl, pageData, pageSocialImage)
            const defaultOgImagePath = `https://${baseUrl}/static/og-image.png`
            const ogImagePath = generatedOgImagePath ?? imageFromMetadata ?? defaultOgImagePath
            const ogImageMimeType = imageMimeType(ogImagePath)
            return (
              <>
                {generatedOgImagePath && (
                  <>
                    <meta property="og:image:width" content={fullOptions.width.toString()} />
                    <meta property="og:image:height" content={fullOptions.height.toString()} />
                  </>
                )}

                <meta property="og:image" content={ogImagePath} />
                <meta property="og:image:url" content={ogImagePath} />
                <meta name="twitter:image" content={ogImagePath} />
                <meta property="og:image:type" content={ogImageMimeType} />
              </>
            )
          },
        ],
      }
    },
  }
}
