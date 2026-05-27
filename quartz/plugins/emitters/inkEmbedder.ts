import { QuartzEmitterPlugin } from "../types"

export interface InkEmbedderOptions {
  scriptSrc?: string
  styleSrc?: string
}

const defaultOptions: Required<InkEmbedderOptions> = {
  scriptSrc: "/static/interactive/gamecult-ink-embedder.js",
  styleSrc: "/static/interactive/gamecult-ink-embedder.css",
}

export const InkEmbedder: QuartzEmitterPlugin<InkEmbedderOptions> = (opts) => {
  const options = { ...defaultOptions, ...opts }

  return {
    name: "InkEmbedder",
    async *emit() {},
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
