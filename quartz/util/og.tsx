import { promises as fs } from "fs"
import { FontWeight, SatoriOptions } from "satori/wasm"
import { GlobalConfiguration } from "../cfg"
import { QuartzPluginData } from "../plugins/vfile"
import { JSXInternal } from "preact/src/jsx"
import { FontSpecification, getFontSpecificationName, ThemeKey } from "./theme"
import path from "path"
import { QUARTZ } from "./path"
import { formatDate, getDate } from "../components/Date"
import readingTime from "reading-time"
import { i18n } from "../i18n"
import { styleText } from "util"

const defaultHeaderWeight = [700]
const defaultBodyWeight = [400]

export async function getSatoriFonts(headerFont: FontSpecification, bodyFont: FontSpecification) {
  // Get all weights for header and body fonts
  const headerWeights: FontWeight[] = (
    typeof headerFont === "string"
      ? defaultHeaderWeight
      : (headerFont.weights ?? defaultHeaderWeight)
  ) as FontWeight[]
  const bodyWeights: FontWeight[] = (
    typeof bodyFont === "string" ? defaultBodyWeight : (bodyFont.weights ?? defaultBodyWeight)
  ) as FontWeight[]

  const headerFontName = typeof headerFont === "string" ? headerFont : headerFont.name
  const bodyFontName = typeof bodyFont === "string" ? bodyFont : bodyFont.name

  // Fetch fonts for all weights and convert to satori format in one go
  const headerFontPromises = headerWeights.map(async (weight) => {
    const data = await fetchTtf(headerFontName, weight)
    if (!data) return null
    return {
      name: headerFontName,
      data,
      weight,
      style: "normal" as const,
    }
  })

  const bodyFontPromises = bodyWeights.map(async (weight) => {
    const data = await fetchTtf(bodyFontName, weight)
    if (!data) return null
    return {
      name: bodyFontName,
      data,
      weight,
      style: "normal" as const,
    }
  })

  const [headerFonts, bodyFonts] = await Promise.all([
    Promise.all(headerFontPromises),
    Promise.all(bodyFontPromises),
  ])

  // Filter out any failed fetches and combine header and body fonts
  const fonts: SatoriOptions["fonts"] = [
    ...headerFonts.filter((font): font is NonNullable<typeof font> => font !== null),
    ...bodyFonts.filter((font): font is NonNullable<typeof font> => font !== null),
  ]

  return fonts
}

/**
 * Get the `.ttf` file of a google font
 * @param fontName name of google font
 * @param weight what font weight to fetch font
 * @returns `.ttf` file of google font
 */
export async function fetchTtf(
  rawFontName: string,
  weight: FontWeight,
): Promise<Buffer<ArrayBufferLike> | undefined> {
  const fontName = rawFontName.replaceAll(" ", "+")
  const cacheKey = `${fontName}-${weight}`
  const cacheDir = path.join(QUARTZ, ".quartz-cache", "fonts")
  const cachePath = path.join(cacheDir, cacheKey)

  // Check if font exists in cache
  try {
    await fs.access(cachePath)
    return fs.readFile(cachePath)
  } catch (error) {
    // ignore errors and fetch font
  }

  // Get css file from google fonts
  const cssResponse = await fetch(
    `https://fonts.googleapis.com/css2?family=${fontName}:wght@${weight}`,
  )
  const css = await cssResponse.text()

  // Extract .ttf url from css file
  const urlRegex = /url\((https:\/\/fonts.gstatic.com\/s\/.*?.ttf)\)/g
  const match = urlRegex.exec(css)

  if (!match) {
    console.log(
      styleText(
        "yellow",
        `\nWarning: Failed to fetch font ${rawFontName} with weight ${weight}, got ${cssResponse.statusText}`,
      ),
    )
    return
  }

  // fontData is an ArrayBuffer containing the .ttf file data
  const fontResponse = await fetch(match[1])
  const fontData = Buffer.from(await fontResponse.arrayBuffer())
  await fs.mkdir(cacheDir, { recursive: true })
  await fs.writeFile(cachePath, fontData)

  return fontData
}

export type SocialImageOptions = {
  /**
   * What color scheme to use for image generation (uses colors from config theme)
   */
  colorScheme: ThemeKey
  /**
   * Height to generate image with in pixels (should be around 630px)
   */
  height: number
  /**
   * Width to generate image with in pixels (should be around 1200px)
   */
  width: number
  /**
   * Whether to use the auto generated image for the root path ("/", when set to false) or the default og image (when set to true).
   */
  excludeRoot: boolean
  /**
   * JSX to use for generating image. See satori docs for more info (https://github.com/vercel/satori)
   */
  imageStructure: (
    options: ImageOptions & {
      userOpts: UserOpts
      iconBase64?: string
      imageBase64?: string
    },
  ) => JSXInternal.Element
}

export type UserOpts = Omit<SocialImageOptions, "imageStructure">

export type ImageOptions = {
  /**
   * what title to use as header in image
   */
  title: string
  /**
   * what description to use as body in image
   */
  description: string
  /**
   * short deck/tagline to use inside the image card
   */
  deck: string
  /**
   * section label for the card
   */
  section?: string
  /**
   * header + body font to be used when generating satori image (as promise to work around sync in component)
   */
  fonts: SatoriOptions["fonts"]
  /**
   * `GlobalConfiguration` of quartz (used for theme/typography)
   */
  cfg: GlobalConfiguration
  /**
   * full file data of current page
   */
  fileData: QuartzPluginData
}

// This is the default template for generated social image.
export const defaultImage: SocialImageOptions["imageStructure"] = ({
  cfg,
  userOpts,
  title,
  description,
  deck,
  section,
  fileData,
  iconBase64,
  imageBase64,
}) => {
  const { colorScheme } = userOpts
  const fontBreakPoint = 30
  const useSmallerFont = title.length > fontBreakPoint

  // Format date if available
  const rawDate = getDate(cfg, fileData)
  const date = rawDate ? formatDate(rawDate, cfg.locale) : null

  // Calculate reading time
  const { minutes } = readingTime(fileData.text ?? "")
  const readingTimeText = i18n(cfg.locale).components.contentMeta.readingTime({
    minutes: Math.ceil(minutes),
  })

  const bodyFont = getFontSpecificationName(cfg.theme.typography.body)
  const headerFont = getFontSpecificationName(cfg.theme.typography.header)
  const displayDeck = deck || description
  const showImage = Boolean(imageBase64)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        backgroundColor: cfg.theme.colors[colorScheme].light,
        position: "relative",
        overflow: "hidden",
        fontFamily: bodyFont,
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${cfg.theme.colors[colorScheme].highlight}, transparent 58%)`,
        }}
      />
      {showImage && (
        <img
          src={imageBase64}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        />
      )}
      {showImage && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(7,17,26,0.94) 0%, rgba(7,17,26,0.78) 28%, rgba(7,17,26,0.42) 52%, rgba(7,17,26,0.14) 72%, rgba(7,17,26,0.06) 100%)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(7,17,26,0.2) 0%, rgba(7,17,26,0.4) 60%, rgba(7,17,26,0.78) 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          padding: "2.4rem",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "2.2rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            {iconBase64 && (
              <img
                src={iconBase64}
                width={46}
                height={46}
                style={{
                  borderRadius: "50%",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                fontSize: 28,
                color: cfg.theme.colors[colorScheme].darkgray,
                fontFamily: bodyFont,
              }}
            >
              {cfg.pageTitle}
            </div>
          </div>
          {section && (
            <div
              style={{
                display: "flex",
                padding: "0.55rem 0.95rem",
                borderRadius: "999px",
                backgroundColor: "rgba(255, 138, 42, 0.16)",
                border: `1px solid ${cfg.theme.colors[colorScheme].secondary}`,
                color: cfg.theme.colors[colorScheme].secondary,
                fontSize: 22,
                fontFamily: bodyFont,
              }}
            >
              {section}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            flex: 1,
            maxWidth: showImage ? "58%" : "100%",
            padding: showImage ? "1.8rem 1.9rem 1.55rem" : 0,
            borderRadius: showImage ? "28px" : 0,
            backgroundColor: showImage ? "rgba(7,17,26,0.62)" : "transparent",
            border: showImage ? "1px solid rgba(231,236,244,0.08)" : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              marginBottom: "1.2rem",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: useSmallerFont ? 66 : 78,
                fontFamily: headerFont,
                fontWeight: 300,
                letterSpacing: "-0.04em",
                color: cfg.theme.colors[colorScheme].dark,
                lineHeight: 1.05,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </h1>
          </div>
          <div
            style={{
              display: "flex",
              marginBottom: "2.4rem",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 31,
                color: cfg.theme.colors[colorScheme].darkgray,
                lineHeight: 1.25,
                maxWidth: "100%",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 3,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayDeck}
            </p>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.75rem",
              marginTop: "auto",
              paddingTop: "1.5rem",
              borderTop: `1px solid ${cfg.theme.colors[colorScheme].lightgray}`,
              color: cfg.theme.colors[colorScheme].gray,
              fontSize: 24,
            }}
          >
            {date && (
              <div style={{ display: "flex", alignItems: "center" }}>
                <svg
                  style={{ marginRight: "0.45rem" }}
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                {date}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center" }}>
              <svg
                style={{ marginRight: "0.45rem" }}
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              {readingTimeText}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
