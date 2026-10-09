import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

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
