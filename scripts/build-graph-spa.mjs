import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function parseArgs(argv) {
  const options = {
    siteRoot: process.cwd(),
    outputDir: "static/epiphany-graph",
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

function runBuild(graphRoot, outputRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["./node_modules/vite/bin/vite.js", "build", "--base", "./"],
      {
        cwd: graphRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          GAMECULT_GRAPH_SPA_OUT_DIR: outputRoot,
        },
      },
    )

    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Graph SPA build exited with code ${code}`))
    })
    child.on("error", reject)
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const siteRoot = path.resolve(options.siteRoot)
  const outputRoot = path.resolve(siteRoot, options.outputDir)
  const graphRoot = path.join(engineRoot, "quartz", "graph-spa")

  await linkNodeModules(graphRoot)
  await runBuild(graphRoot, outputRoot)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
