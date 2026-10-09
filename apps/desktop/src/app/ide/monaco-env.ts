// Package exports map `monaco-editor/<path>` onto `esm/vs/<path>.js`. The
// `esm/vs/` prefix is not a valid subpath, so workers are imported without it.
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

/** jsdom has no matchMedia. Monaco's theme service calls it while the editor mounts. */
function ensureMatchMedia() {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'function') {
    return
  }

  window.matchMedia = (query: string) =>
    ({
      addEventListener() {},
      addListener() {},
      dispatchEvent() {
        return false
      },
      matches: false,
      media: query,
      onchange: null,
      removeEventListener() {},
      removeListener() {}
    }) as unknown as MediaQueryList
}

const WORKERS: Record<string, new () => Worker> = {
  css: CssWorker,
  handlebars: HtmlWorker,
  html: HtmlWorker,
  javascript: TsWorker,
  json: JsonWorker,
  less: CssWorker,
  razor: HtmlWorker,
  scss: CssWorker,
  typescript: TsWorker
}

/**
 * Workers are Vite bundles (`?worker`), never a CDN. In a packaged build they
 * land in `dist/assets` next to the renderer. `dist/**` is already asarUnpacked;
 * a packager that later leaves dist inside app.asar must unpack `*worker*`.
 */
export function ensureMonacoEnvironment() {
  ensureMatchMedia()

  const host = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker }
  }

  if (host.MonacoEnvironment?.getWorker) {
    return
  }

  host.MonacoEnvironment = {
    getWorker(_workerId, label) {
      const WorkerCtor = WORKERS[label] ?? EditorWorker

      return new WorkerCtor()
    }
  }
}
