import fs from "node:fs/promises"
import path from "node:path"
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

  const actualRevision = execFileSync("git", ["-C", nornRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim()
  if (actualRevision !== expectedRevision) {
    throw new Error(`Norn must be revision ${expectedRevision}; found ${actualRevision}.`)
  }

  const status = execFileSync(
    "git",
    ["-C", nornRoot, "status", "--porcelain", "--untracked-files=normal"],
    { encoding: "utf8" },
  ).trim()
  if (status) {
    throw new Error(`Norn must be clean before GameCult-Quartz consumes it: ${nornRoot}`)
  }

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

  return viewerRoot
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

  const nornViewerRoot = await prepareNorn(nornRoot)
  await linkNodeModules(graphRoot)
  await runProcess(
    process.execPath,
    ["./node_modules/vite/bin/vite.js", "build", "--base", "./"],
    graphRoot,
    {
      GAMECULT_GRAPH_SPA_OUT_DIR: outputRoot,
      GAMECULT_NORN_VIEWER_ROOT: nornViewerRoot,
    },
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
