import { QuartzComponent, QuartzComponentConstructor } from "./types"

export type GameCultGraphSpaShellOptions = {
  stylesheetHref: string
  moduleSrc: string
  rootClassName?: string
  config?: {
    title?: string
    architectureDescription?: string
    layoutMode?:
      | "layered"
      | "stress"
      | "force"
      | "combined-force"
      | {
          architecture?: "layered" | "stress" | "force" | "combined-force"
          dataflow?: "layered" | "stress" | "force" | "combined-force"
        }
    allowedSlugPrefixes?: string[]
    blockedSlugPrefixes?: string[]
    blockedPathSegments?: string[]
    sectionOrder?: string[]
  }
}

export default ((options?: Partial<GameCultGraphSpaShellOptions>) => {
  const shellOptions: GameCultGraphSpaShellOptions = {
    stylesheetHref: "/static/epiphany-graph/assets/viewer.css",
    moduleSrc: "/static/epiphany-graph/assets/viewer.js",
    rootClassName: "gamecult-epiphany-graph-root",
    ...options,
  }

  const GameCultGraphSpaShell: QuartzComponent = () => (
    <>
      <link rel="stylesheet" href={shellOptions.stylesheetHref} />
      <div
        class={shellOptions.rootClassName}
        data-graph-config={shellOptions.config ? JSON.stringify(shellOptions.config) : undefined}
      ></div>
      <script type="module" src={shellOptions.moduleSrc}></script>
    </>
  )

  return GameCultGraphSpaShell
}) satisfies QuartzComponentConstructor<Partial<GameCultGraphSpaShellOptions> | undefined>
