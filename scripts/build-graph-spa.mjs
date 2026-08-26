import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function parseArgs(argv) {
  const options = {
    siteRoot: process.cwd(),
    outputDir: "static/epiphany-graph",
    nornRoot: path.resolve(engineRoot, "..", "Norn"),
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) continue

    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith("--")) {
      options[key] = next
      i++
    } else {
      options[key] = "true"
    }
  }

  return options
}

async function exists(targetPath) {
  try {
    await fs.lstat(targetPath)
    return true
  } catch {
    return false
  }
}

async function linkNodeModules(graphRoot) {
  const source = path.join(engineRoot, "node_modules")
  const dest = path.join(graphRoot, "node_modules")

  if (!(await exists(source))) {
    throw new Error(
      "GameCult-Quartz dependencies are missing. Run `npm ci` in the GameCult-Quartz repo first.",
    )
  }

  await fs.rm(dest, { recursive: true, force: true })
  await fs.symlink(source, dest, "junction")
}

async function prepareNorn(nornRoot) {
  const viewerRoot = path.join(nornRoot, "web", "norn-viewer")
  const revisionPath = path.join(engineRoot, "quartz", "graph-spa", "norn-revision.txt")
  const expectedRevision = (await fs.readFile(revisionPath, "utf8")).trim()
  const packagePath = path.join(viewerRoot, "package.json")
  const tsupPath = path.join(viewerRoot, "node_modules", "tsup", "dist", "cli-default.js")

  if (!(await exists(packagePath))) {
    throw new Error(
      `Norn was not found at '${nornRoot}'. Clone GameCult/Norn beside GameCult-Quartz or pass --nornRoot.`,
    )
  }

  const actualRevision = admitGitWorktree("Norn", nornRoot)
  if (actualRevision !== expectedRevision) {
    throw new Error(`Norn must be revision ${expectedRevision}; found ${actualRevision}.`)
  }

  return { actualRevision, tsupPath, viewerRoot }
}

async function buildNorn({ tsupPath, viewerRoot }) {
  if (!(await exists(tsupPath))) {
    throw new Error(`Norn dependencies are missing. Run npm ci in '${viewerRoot}'.`)
  }

  await runProcess(
    process.execPath,
    [
      tsupPath,
      "src/index.ts",
      "--format",
      "esm,cjs",
      "--dts",
      "--external",
      "react",
      "--external",
      "react-dom",
      "--clean",
    ],
    viewerRoot,
  )
}

function admitGitWorktree(name, root) {
  const revision = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim()
  const status = execFileSync(
    "git",
    ["-C", root, "status", "--porcelain", "--untracked-files=normal"],
    { encoding: "utf8" },
  ).trim()

  if (status) {
    throw new Error(`${name} must be clean before the graph SPA is admitted: ${root}`)
  }

  return revision
}

const BUNDLE_ARTIFACTS = ["viewer.html", "assets/react.js", "assets/viewer.css", "assets/viewer.js"]

async function sha256(targetPath) {
  return createHash("sha256")
    .update(await fs.readFile(targetPath))
    .digest("hex")
}

async function bundleProvenance(outputRoot, quartzRevision, nornRevision) {
  const lines = [
    "schema=gamecult.graph_spa_bundle.v0",
    `gamecult_quartz_revision=${quartzRevision}`,
    `norn_revision=${nornRevision}`,
  ]

  for (const artifact of BUNDLE_ARTIFACTS) {
    lines.push(`artifact.${artifact}.sha256=${await sha256(path.join(outputRoot, artifact))}`)
  }

  return `${lines.join("\n")}\n`
}

async function verifyBundleProvenance(outputRoot, quartzRevision, nornRevision) {
  const provenancePath = path.join(outputRoot, "bundle.provenance")
  const expected = await bundleProvenance(outputRoot, quartzRevision, nornRevision)
  const actual = await fs.readFile(provenancePath, "utf8")

  if (actual !== expected) {
    throw new Error(`Graph SPA provenance or artifact digests are stale: ${provenancePath}`)
  }
}

function runProcess(command, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv,
      },
    })

    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${path.basename(command)} exited with code ${code}`))
    })
    child.on("error", reject)
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const siteRoot = path.resolve(options.siteRoot)
  const outputRoot = path.resolve(siteRoot, options.outputDir)
  const graphRoot = path.join(engineRoot, "quartz", "graph-spa")
  const nornRoot = path.resolve(options.nornRoot)
  const quartzRevision = admitGitWorktree("GameCult-Quartz", engineRoot)
  const norn = await prepareNorn(nornRoot)

  if (options.verify === "true") {
    await verifyBundleProvenance(outputRoot, quartzRevision, norn.actualRevision)
    console.log(`Verified graph SPA provenance at ${path.join(outputRoot, "bundle.provenance")}`)
    return
  }

  await buildNorn(norn)
  await linkNodeModules(graphRoot)
  await runProcess(
    process.execPath,
    ["./node_modules/vite/bin/vite.js", "build", "--base", "./"],
    graphRoot,
    {
      GAMECULT_GRAPH_SPA_OUT_DIR: outputRoot,
      GAMECULT_NORN_VIEWER_ROOT: norn.viewerRoot,
    },
  )
  const provenance = await bundleProvenance(outputRoot, quartzRevision, norn.actualRevision)
  await fs.writeFile(path.join(outputRoot, "bundle.provenance"), provenance, "utf8")
  await verifyBundleProvenance(outputRoot, quartzRevision, norn.actualRevision)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
