import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function parseArgs(argv) {
  const [mode = "build", ...rest] = argv
  const options = {
    mode,
    overlayDir: "site",
    outputDir: "quartz-site/public",
    baseDir: "",
  }

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg.startsWith("--")) continue

    const key = arg.slice(2)
    const next = rest[i + 1]
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

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true })
}

async function clearDir(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true })
  await fs.mkdir(targetPath, { recursive: true })
}

async function copyEngineScaffold(runtimeRoot) {
  const entries = await fs.readdir(engineRoot, { withFileTypes: true })
  const skip = new Set([
    ".git",
    ".github",
    "node_modules",
    "public",
    "scripts",
    "README.md",
    "CODE_OF_CONDUCT.md",
    "Dockerfile",
    "quartz.config.ts",
    "quartz.layout.ts",
  ])

  for (const entry of entries) {
    if (skip.has(entry.name)) continue
    const source = path.join(engineRoot, entry.name)
    const dest = path.join(runtimeRoot, entry.name)

    if (entry.isDirectory()) {
      await fs.cp(source, dest, {
        recursive: true,
        filter: (candidate) => {
          const relative = path.relative(engineRoot, candidate).split(path.sep).join("/")
          return relative !== "quartz/graph-spa/node_modules"
        },
      })
    } else {
      await fs.copyFile(source, dest)
    }
  }
}

async function linkNodeModules(runtimeRoot) {
  const source = path.join(engineRoot, "node_modules")
  const dest = path.join(runtimeRoot, "node_modules")

  if (!(await exists(source))) {
    throw new Error(
      "GameCult-Quartz dependencies are missing. Run `npm ci` in the GameCult-Quartz repo first.",
    )
  }

  await fs.rm(dest, { recursive: true, force: true })
  await fs.symlink(source, dest, "junction")
}

async function overlayFiles(sourceRoot, targetRoot) {
  const stack = [""]

  while (stack.length > 0) {
    const relative = stack.pop()
    const sourcePath = path.join(sourceRoot, relative)
    const entries = await fs.readdir(sourcePath, { withFileTypes: true })

    for (const entry of entries) {
      const entryRelative = path.join(relative, entry.name)
      const entrySource = path.join(sourceRoot, entryRelative)
      const entryTarget = path.join(targetRoot, entryRelative)

      if (entry.isDirectory()) {
        await ensureDir(entryTarget)
        stack.push(entryRelative)
        continue
      }

      await ensureDir(path.dirname(entryTarget))
      await fs.rm(entryTarget, { recursive: true, force: true })
      await fs.link(entrySource, entryTarget)
    }
  }
}

function runQuartz(runtimeRoot, options, contentRoot, outputRoot) {
  const args = ["quartz/bootstrap-cli.mjs", "build", "-d", contentRoot, "-o", outputRoot]

  if (options.mode === "dev") {
    args.push("--serve")
  }

  if (options.port) {
    args.push("--port", String(options.port))
  }

  if (options.wsPort) {
    args.push("--wsPort", String(options.wsPort))
  }

  if (options.baseDir) {
    args.push("--baseDir", String(options.baseDir))
  }

  if (options.remoteDevHost) {
    args.push("--remoteDevHost", String(options.remoteDevHost))
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: runtimeRoot,
      stdio: "inherit",
      env: process.env,
    })

    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Quartz exited with code ${code}`))
    })

    child.on("error", reject)
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const siteRoot = options.siteRoot ? path.resolve(options.siteRoot) : process.cwd()
  const overlayRoot = path.resolve(siteRoot, options.overlayDir)
  const contentRoot = options.contentDir
    ? path.resolve(siteRoot, options.contentDir)
    : path.resolve(siteRoot, "content")
  const outputRoot = path.resolve(siteRoot, options.outputDir)
  const stageRoot = path.join(siteRoot, ".quartz-build")
  const runtimeRoot = path.join(stageRoot, "engine")

  if (!(await exists(overlayRoot))) {
    throw new Error(`Overlay directory not found: ${overlayRoot}`)
  }

  if (!(await exists(path.join(overlayRoot, "quartz.config.ts")))) {
    throw new Error(`Missing site overlay config: ${path.join(overlayRoot, "quartz.config.ts")}`)
  }

  if (!(await exists(path.join(overlayRoot, "quartz.layout.ts")))) {
    throw new Error(`Missing site overlay layout: ${path.join(overlayRoot, "quartz.layout.ts")}`)
  }

  if (!(await exists(contentRoot))) {
    throw new Error(`Content directory not found: ${contentRoot}`)
  }

  await clearDir(runtimeRoot)
  await ensureDir(stageRoot)
  await ensureDir(path.dirname(outputRoot))
  await copyEngineScaffold(runtimeRoot)
  await linkNodeModules(runtimeRoot)
  await overlayFiles(overlayRoot, runtimeRoot)

  console.log(`GameCult-Quartz runtime staged at ${runtimeRoot}`)
  console.log(`Content source: ${contentRoot}`)
  console.log(`Output target: ${outputRoot}`)

  await runQuartz(runtimeRoot, options, contentRoot, outputRoot)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
