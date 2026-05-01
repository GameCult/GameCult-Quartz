import test from "node:test"
import assert from "node:assert/strict"
import { Root } from "hast"
import { extractDescriptionText } from "./description"

test("extractDescriptionText strips a duplicate top-level h1", () => {
  const tree: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "Why Aetheria Went Quiet" }],
      },
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "text",
            value: "Aetheria reached the point every serious ambitious project eventually reaches.",
          },
        ],
      },
    ],
  }

  assert.equal(
    extractDescriptionText(tree, "Why Aetheria Went Quiet"),
    "Aetheria reached the point every serious ambitious project eventually reaches.",
  )
})

test("extractDescriptionText strips a standalone emphasized tagline after the title", () => {
  const tree: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "Why Aetheria Went Quiet" }],
      },
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "em",
            properties: {},
            children: [
              { type: "text", value: '"The project did not vanish because the idea was small."' },
            ],
          },
        ],
      },
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "text",
            value: "Aetheria reached the point every serious ambitious project eventually reaches.",
          },
        ],
      },
    ],
  }

  assert.equal(
    extractDescriptionText(tree, "Why Aetheria Went Quiet"),
    "Aetheria reached the point every serious ambitious project eventually reaches.",
  )
})

test("extractDescriptionText keeps the first paragraph when it is normal content", () => {
  const tree: Root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "Why Aetheria Went Quiet" }],
      },
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "text",
            value: "This first paragraph is the actual summary, not decorative throat-clearing.",
          },
        ],
      },
    ],
  }

  assert.equal(
    extractDescriptionText(tree, "Why Aetheria Went Quiet"),
    "This first paragraph is the actual summary, not decorative throat-clearing.",
  )
})
