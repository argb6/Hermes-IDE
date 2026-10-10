/**
 * Mermaid language support for the Monaco source view.
 *
 * The rendered side is already covered — `components/assistant-ui/embeds/`
 * lazy-loads `mermaid` for ```mermaid fences and whole `.mermaid`/`.mmd`
 * files. This module only teaches the EDITOR to colour the source: a Monarch
 * grammar covering the diagram types Mermaid ships (flowchart, sequence,
 * class, state, ER, journey, gantt, pie, mindmap, timeline, git graph), the
 * shared keywords (`subgraph`, `direction`), arrows, labels and `%%` comments.
 *
 * The grammar is exported as data so tests can assert its shape without
 * booting Monaco; `registerMermaidLanguage` wires it in (idempotent).
 */

import type * as Monaco from 'monaco-editor'

export const MERMAID_MONARCH: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: false,
  tokenizer: {
    root: [
      // Diagram-type declarations start a line; `graph`/`flowchart` then a direction.
      [
        /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment))\b/,
        'keyword'
      ],
      [/^\s*(subgraph|end|direction)\b/, 'keyword'],
      [/%%.*$/, 'comment'],
      [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/, 'string'],
      // The arrow zoo: -> --> --- -.-. ==> --x --o |--> -->> etc.
      [/(?:={2,3}|~{2,3}|-{2,3}>|-\.->|<-{2,3}|={2,}>|x-{2,}|o-{2,}|\|-->|\|--|--\|o|x--\|o|x--x|o--o|-\.->|\.->)/, 'operator'],
      [/[()[\]{}|<>]/, 'delimiter'],
      [/\b\d+(?:\.\d+)?%?\b/, 'number'],
      [/[A-Za-z_][\w-]*/, 'identifier'],
      [/[^\s]/, '']
    ]
  }
}

let registered = false

/** Register the `mermaid` language + grammar with Monaco (safe to call often). */
export function registerMermaidLanguage(monaco: typeof Monaco): void {
  if (registered) {
    return
  }
  registered = true

  monaco.languages.register({
    id: 'mermaid',
    extensions: ['.mermaid', '.mmd'],
    aliases: ['Mermaid', 'mermaid'],
    mimetypes: ['text/x-mermaid']
  })
  monaco.languages.setMonarchTokensProvider('mermaid', MERMAID_MONARCH)
}
