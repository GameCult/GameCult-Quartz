import { promises as fs } from "fs"
import { FontWeight, SatoriOptions } from "satori/wasm"
import { GlobalConfiguration } from "../cfg"
import { QuartzPluginData } from "../plugins/vfile"
import { JSXInternal } from "preact/src/jsx"
import { FontSpecification, getFontSpecificationName, ThemeKey } from "./theme"
import path from "path"
import { QUARTZ } from "./path"
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
  imageBase64,
}) => {
  const { colorScheme } = userOpts
  const displayDeck = deck || description || title
  const showImage = Boolean(imageBase64)
  const headerFont = getFontSpecificationName(cfg.theme.typography.header)
  const bodyFont = getFontSpecificationName(cfg.theme.typography.body)
  const chromeBackground = "rgba(0,0,0,0.25)"
  const deckLength = displayDeck.length
  const deckFontSize =
    deckLength > 85 ? 24 : deckLength > 65 ? 27 : deckLength > 50 ? 30 : deckLength > 36 ? 34 : 40

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
          background: "linear-gradient(180deg, rgba(7,17,26,0.12) 0%, rgba(7,17,26,0.24) 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
          padding: "2.4rem",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            maxWidth: "92%",
            padding: "1rem 1.7rem",
            borderRadius: "24px",
            backgroundColor: chromeBackground,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: deckFontSize,
              fontFamily: headerFont,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              color: "rgba(248,250,252,0.98)",
              textAlign: "center",
              textShadow: "0 4px 18px rgba(0,0,0,0.78)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.08,
              maxWidth: "100%",
            }}
          >
            {displayDeck}
          </p>
        </div>
      </div>
    </div>
  )
}
