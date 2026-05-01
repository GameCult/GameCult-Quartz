import { Element, Root as HTMLRoot, RootContent } from "hast"
import { toString } from "hast-util-to-string"
import { QuartzTransformerPlugin } from "../types"
import { escapeHTML } from "../../util/escape"

export interface Options {
  descriptionLength: number
  maxDescriptionLength: number
  replaceExternalLinks: boolean
}

const defaultOptions: Options = {
  descriptionLength: 150,
  maxDescriptionLength: 300,
  replaceExternalLinks: true,
}

const urlRegex = new RegExp(
  /(https?:\/\/)?(?<domain>([\da-z\.-]+)\.([a-z\.]{2,6})(:\d+)?)(?<path>[\/\w\.-]*)(\?[\/\w\.=&;-]*)?/,
  "g",
)

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function isElementNode(node: RootContent): node is Element {
  return node.type === "element"
}

function isHeadingElement(node: RootContent): node is Element {
  return isElementNode(node) && /^h[1-6]$/.test(node.tagName)
}

function isMeaningfulNode(node: RootContent): boolean {
  return normalizeWhitespace(toString(node)).length > 0
}

function isStandalonePreviewTagline(node: RootContent): boolean {
  if (!isElementNode(node) || node.tagName !== "p") {
    return false
  }

  const meaningfulChildren = node.children.filter(
    (child) => !(child.type === "text" && normalizeWhitespace(child.value).length === 0),
  )

  if (meaningfulChildren.length !== 1) {
    return false
  }

  const onlyChild = meaningfulChildren[0]
  return isElementNode(onlyChild) && ["em", "strong"].includes(onlyChild.tagName)
}

export function extractDescriptionText(tree: HTMLRoot, pageTitle?: string): string {
  const children = [...tree.children]
  let startIdx = 0

  while (startIdx < children.length && !isMeaningfulNode(children[startIdx])) {
    startIdx++
  }

  while (startIdx < children.length && isHeadingElement(children[startIdx])) {
    startIdx++
  }

  while (startIdx < children.length && !isMeaningfulNode(children[startIdx])) {
    startIdx++
  }

  if (startIdx < children.length && pageTitle && isStandalonePreviewTagline(children[startIdx])) {
    startIdx++
  }

  while (startIdx < children.length && !isMeaningfulNode(children[startIdx])) {
    startIdx++
  }

  return escapeHTML(toString({ ...tree, children: children.slice(startIdx) }))
}

export const Description: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "Description",
    htmlPlugins() {
      return [
        () => {
          return async (tree: HTMLRoot, file) => {
            let frontMatterDescription = file.data.frontmatter?.description
            let text = extractDescriptionText(tree, file.data.frontmatter?.title)

            if (opts.replaceExternalLinks) {
              frontMatterDescription = frontMatterDescription?.replace(
                urlRegex,
                "$<domain>" + "$<path>",
              )
              text = text.replace(urlRegex, "$<domain>" + "$<path>")
            }

            if (frontMatterDescription) {
              file.data.description = frontMatterDescription
              file.data.text = text
              return
            }

            // otherwise, use the text content
            const desc = text
            const sentences = desc.replace(/\s+/g, " ").split(/\.\s/)
            let finalDesc = ""
            let sentenceIdx = 0

            // Add full sentences until we exceed the guideline length
            while (sentenceIdx < sentences.length) {
              const sentence = sentences[sentenceIdx]
              if (!sentence) break

              const currentSentence = sentence.endsWith(".") ? sentence : sentence + "."
              const nextLength = finalDesc.length + currentSentence.length + (finalDesc ? 1 : 0)

              // Add the sentence if we're under the guideline length
              // or if this is the first sentence (always include at least one)
              if (nextLength <= opts.descriptionLength || sentenceIdx === 0) {
                finalDesc += (finalDesc ? " " : "") + currentSentence
                sentenceIdx++
              } else {
                break
              }
            }

            // truncate to max length if necessary
            file.data.description =
              finalDesc.length > opts.maxDescriptionLength
                ? finalDesc.slice(0, opts.maxDescriptionLength) + "..."
                : finalDesc
            file.data.text = text
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    description: string
    text: string
  }
}
