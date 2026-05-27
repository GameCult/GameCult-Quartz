import { QuartzEmitterPlugin } from "../types"
import { FilePath, joinSegments } from "../../util/path"
import { createRequire } from "module"
import fs from "fs"
import path from "path"

export interface InkEmbedderOptions {
  scriptSrc?: string
  styleSrc?: string
  runtimeSrc?: string
}

const defaultOptions: Required<InkEmbedderOptions> = {
  scriptSrc: "/static/interactive/sai.js",
  styleSrc: "/static/interactive/sai.css",
  runtimeSrc: "/static/interactive/ink.js",
}

const require = createRequire(import.meta.url)

function resolveSaiDistPath(filename: string) {
  return path.join(path.dirname(require.resolve("@gamecult/sai/sai.js")), filename)
}

function localStaticDest(outputRoot: string, resourcePath: string) {
  if (!resourcePath.startsWith("/static/")) return null
  return joinSegments(outputRoot, resourcePath.slice(1)) as FilePath
}

async function copySaiAsset(outputRoot: string, resourcePath: string, filename: string) {
  const dest = localStaticDest(outputRoot, resourcePath)
  if (!dest) return null

  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  await fs.promises.copyFile(resolveSaiDistPath(filename), dest)
  return dest
}

export const InkEmbedder: QuartzEmitterPlugin<InkEmbedderOptions> = (opts) => {
  const options = { ...defaultOptions, ...opts }

  return {
    name: "InkEmbedder",
    async *emit({ argv }) {
      const copied = await Promise.all([
        copySaiAsset(argv.output, options.scriptSrc, "sai.js"),
        copySaiAsset(argv.output, options.styleSrc, "sai.css"),
        copySaiAsset(argv.output, options.runtimeSrc, "ink.js"),
      ])

      for (const dest of copied) {
        if (dest) yield dest
      }
    },
    async *partialEmit() {},
    externalResources: () => ({
      css: [
        {
          content: options.styleSrc,
          spaPreserve: true,
        },
      ],
      js: [
        {
          src: options.scriptSrc,
          loadTime: "afterDOMReady",
          contentType: "external",
          spaPreserve: true,
        },
      ],
    }),
  }
}
