import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { SETTINGS_ROUTE } from '@/app/routes'
import { useI18n } from '@/i18n'
import { readDesktopFileText, selectDesktopPaths, writeDesktopFileText } from '@/lib/desktop-fs'
import { cn } from '@/lib/utils'
import { openCommandPalette } from '@/store/command-palette'
import { notifyError } from '@/store/notifications'
import { $focusedWorkspaceCwd } from '@/store/session-states'
import { openNewWindow } from '@/store/windows'
import { notifyWorkspaceChanged } from '@/store/workspace-events'
import { setWorkspaceMode } from '@/store/workspace-mode'

import { runIdeCommand } from './ide-commands'
import { debugContinue, debugRestart, debugStart, debugStep, debugStop } from './ide-debug-session'
import { $ideEditor, requestIdeSave } from './ide-editor'
import {
  editorAllOccurrences,
  editorClipboard,
  editorCopyLineDown,
  editorCopyLineUp,
  editorCursorAbove,
  editorCursorBelow,
  editorExpandSelection,
  editorFind,
  editorFindReferences,
  editorFormatDocument,
  editorGoToDefinition,
  editorGotoLine,
  editorMatchingBracket,
  editorMoveLineDown,
  editorMoveLineUp,
  editorNextOccurrence,
  editorNextProblem,
  editorPrevOccurrence,
  editorPrevProblem,
  editorRedo,
  editorReplace,
  editorSelectAll,
  editorToggleBlockComment,
  editorToggleBreakpoint,
  editorToggleColumnSelection,
  editorToggleComment,
  editorToggleWordWrap,
  editorUndo
} from './ide-editor-actions'
import { clearIdeBreakpoints, setAllBreakpointsEnabled, toggleIdeBreakpoint } from './ide-state'
import { $ideTimeline, ideBack, ideForward, requestIdeOpen, requestIdeQuickOpen } from './ide-nav'

type Row = { id: string; enabled: boolean; shortcut?: string }

const FILE: Array<Row | 'sep' | 'recent'> = [
  { id: 'file.newText', enabled: true },
  { id: 'file.newWindow', enabled: true },
  { id: 'file.switchAgent', enabled: true },
  { id: 'file.profile', enabled: false },
  'sep',
  { id: 'file.open', enabled: true },
  { id: 'file.openFolder', enabled: true },
  { id: 'file.workspaceFile', enabled: false },
  'recent',
  'sep',
  { id: 'file.addFolder', enabled: false },
  { id: 'file.saveWorkspace', enabled: false },
  { id: 'file.duplicateWorkspace', enabled: false },
  'sep',
  { id: 'file.save', enabled: true, shortcut: 'Ctrl+S' },
  { id: 'file.saveAs', enabled: false },
  { id: 'file.saveAll', enabled: false },
  'sep',
  { id: 'file.share', enabled: false },
  'sep',
  { id: 'file.autoSave', enabled: false },
  { id: 'file.preferences', enabled: true },
  'sep',
  { id: 'file.revert', enabled: false },
  { id: 'file.closeTab', enabled: true },
  { id: 'file.closeFolder', enabled: false },
  { id: 'file.closeWindow', enabled: true },
  'sep',
  { id: 'file.exit', enabled: true }
]

const EDIT: Array<Row | 'sep'> = [
  { id: 'edit.undo', enabled: true, shortcut: 'Ctrl+Z' },
  { id: 'edit.redo', enabled: true, shortcut: 'Ctrl+Y' },
  'sep',
  { id: 'edit.cut', enabled: true, shortcut: 'Ctrl+X' },
  { id: 'edit.copy', enabled: true, shortcut: 'Ctrl+C' },
  { id: 'edit.paste', enabled: true, shortcut: 'Ctrl+V' },
  'sep',
  { id: 'edit.find', enabled: true },
  { id: 'edit.replace', enabled: true },
  'sep',
  { id: 'edit.findFiles', enabled: true },
  { id: 'edit.replaceFiles', enabled: true },
  'sep',
  { id: 'edit.comment', enabled: true, shortcut: 'Ctrl+/' },
  { id: 'edit.blockComment', enabled: true, shortcut: 'Shift+Alt+A' },
  { id: 'edit.format', enabled: true, shortcut: 'Shift+Alt+F' },
  { id: 'edit.emmet', enabled: false }
]

const SELECTION: Array<Row | 'sep'> = [
  { id: 'selection.all', enabled: true, shortcut: 'Ctrl+A' },
  { id: 'selection.expand', enabled: true },
  { id: 'selection.shrink', enabled: false },
  'sep',
  { id: 'selection.copyUp', enabled: true, shortcut: 'Shift+Alt+Up' },
  { id: 'selection.copyDown', enabled: true, shortcut: 'Shift+Alt+Down' },
  { id: 'selection.moveUp', enabled: true, shortcut: 'Alt+Up' },
  { id: 'selection.moveDown', enabled: true, shortcut: 'Alt+Down' },
  { id: 'selection.duplicate', enabled: false },
  'sep',
  { id: 'selection.cursorAbove', enabled: true, shortcut: 'Ctrl+Alt+Up' },
  { id: 'selection.cursorBelow', enabled: true, shortcut: 'Ctrl+Alt+Down' },
  { id: 'selection.lineEnds', enabled: false },
  { id: 'selection.nextOccurrence', enabled: true },
  { id: 'selection.prevOccurrence', enabled: true },
  { id: 'selection.allOccurrences', enabled: true },
  'sep',
  { id: 'selection.ctrlClick', enabled: false },
  { id: 'selection.column', enabled: true }
]

const VIEW: Array<Row | 'sep'> = [
  { id: 'view.command', enabled: true, shortcut: 'Ctrl+K' },
  { id: 'view.openView', enabled: false },
  'sep',
  { id: 'view.appearance', enabled: false },
  { id: 'view.layout', enabled: false },
  'sep',
  { id: 'view.files', enabled: true },
  { id: 'view.search', enabled: true },
  { id: 'view.git', enabled: true },
  { id: 'view.run', enabled: true },
  { id: 'view.extensions', enabled: true },
  'sep',
  { id: 'view.problems', enabled: true },
  { id: 'view.output', enabled: true },
  { id: 'view.debug', enabled: true },
  { id: 'view.terminal', enabled: true },
  'sep',
  { id: 'view.wordWrap', enabled: true }
]

const GO: Array<Row | 'sep'> = [
  { id: 'go.back', enabled: true },
  { id: 'go.forward', enabled: true },
  { id: 'go.lastEdit', enabled: false },
  'sep',
  { id: 'go.switchEditor', enabled: false },
  { id: 'go.switchGroup', enabled: false },
  'sep',
  { id: 'go.file', enabled: true },
  { id: 'go.symbolWorkspace', enabled: false },
  'sep',
  { id: 'go.symbolEditor', enabled: false },
  { id: 'go.definition', enabled: true },
  { id: 'go.declaration', enabled: false },
  { id: 'go.type', enabled: false },
  { id: 'go.implementations', enabled: false },
  { id: 'go.symbolChat', enabled: false },
  { id: 'go.references', enabled: true },
  { id: 'go.symbolNewChat', enabled: false },
  'sep',
  { id: 'go.line', enabled: true },
  { id: 'go.bracket', enabled: true },
  'sep',
  { id: 'go.nextProblem', enabled: true },
  { id: 'go.prevProblem', enabled: true },
  { id: 'go.nextChange', enabled: false },
  { id: 'go.prevChange', enabled: false }
]

const RUN: Row[] = [
  { id: 'run.start', enabled: true },
  { id: 'run.without', enabled: true },
  { id: 'run.stop', enabled: true },
  { id: 'run.restart', enabled: true },
  { id: 'run.configurations', enabled: false },
  { id: 'run.addConfig', enabled: false },
  { id: 'run.stepOver', enabled: true },
  { id: 'run.stepInto', enabled: true },
  { id: 'run.stepOut', enabled: true },
  { id: 'run.continue', enabled: true },
  { id: 'run.breakpoint', enabled: true },
  { id: 'run.newBreakpoint', enabled: true },
  { id: 'run.enableBreakpoints', enabled: true },
  { id: 'run.disableBreakpoints', enabled: true },
  { id: 'run.removeBreakpoints', enabled: true },
  { id: 'run.installDebuggers', enabled: false }
]

const TERMINAL: Array<Row | 'sep'> = [
  { id: 'terminal.new', enabled: true },
  { id: 'terminal.split', enabled: false },
  'sep',
  { id: 'terminal.runTask', enabled: false },
  { id: 'terminal.build', enabled: false },
  { id: 'terminal.runFile', enabled: false },
  { id: 'terminal.runSelection', enabled: false },
  'sep',
  { id: 'terminal.running', enabled: false },
  { id: 'terminal.restartTask', enabled: false },
  { id: 'terminal.terminateTask', enabled: false },
  'sep',
  { id: 'terminal.configure', enabled: false },
  { id: 'terminal.defaultBuild', enabled: false }
]

const HELP: Array<Row | 'sep'> = [
  { id: 'help.commands', enabled: true, shortcut: 'Ctrl+K' },
  { id: 'help.releaseNotes', enabled: true },
  'sep',
  { id: 'help.issue', enabled: true },
  { id: 'help.feedback', enabled: false },
  'sep',
  { id: 'help.license', enabled: true },
  'sep',
  { id: 'help.devtools', enabled: false },
  { id: 'help.process', enabled: false },
  'sep',
  { id: 'help.updates', enabled: true },
  { id: 'help.about', enabled: true }
]

const MENUS = [
  { id: 'file', label: 'file' as const, rows: FILE },
  { id: 'edit', label: 'edit' as const, rows: EDIT },
  { id: 'selection', label: 'selection' as const, rows: SELECTION },
  { id: 'view', label: 'view' as const, rows: VIEW },
  { id: 'go', label: 'go' as const, rows: GO },
  { id: 'run', label: 'run' as const, rows: RUN },
  { id: 'terminal', label: 'terminal' as const, rows: TERMINAL },
  { id: 'help', label: 'help' as const, rows: HELP }
]

function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

/** Title-bar menus. Grey rows stay visible for commands that still have no backend. */
export function IdeMenuBar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const cwd = useStore($focusedWorkspaceCwd)
  const timeline = useStore($ideTimeline)
  const [open, setOpen] = useState<null | string>(null)
  const [recent, setRecent] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(null)
        setRecent(false)
      }
    }

    window.addEventListener('pointerdown', close)

    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const ask = (label: string) => {
    const value = window.prompt(label)

    return value?.trim() || ''
  }

  const openLink = (url: string) => {
    void window.hermesDesktop?.openExternal(url)
  }

  const createFile = async () => {
    if (!cwd) {
      return
    }

    const name = ask(t.ide.menu.prompts.fileName)

    if (!name || name.includes('/') || name.includes('\\')) {
      return
    }

    const sep = cwd.includes('\\') ? '\\' : '/'
    const path = `${cwd.replace(/[\\/]$/, '')}${sep}${name}`

    try {
      await readDesktopFileText(path)
    } catch {
      await writeDesktopFileText(path, '')
      notifyWorkspaceChanged()
    }

    requestIdeOpen(path)
  }

  const openFile = async () => {
    const picked = await selectDesktopPaths({ defaultPath: cwd ?? undefined, directories: false })

    if (picked[0]) {
      requestIdeOpen(picked[0])
    }
  }

  const run = (id: string) => {
    setOpen(null)
    setRecent(false)

    switch (id) {
      case 'file.newText':
        void createFile().catch(error => notifyError(error, t.ide.menu.items['file.newText']))
        break
      case 'file.newWindow':
        void openNewWindow()
        break
      case 'file.switchAgent':
        setWorkspaceMode('agent')
        break
      case 'file.open':
        void openFile().catch(error => notifyError(error, t.ide.menu.items['file.open']))
        break
      case 'file.openFolder':
        runIdeCommand('file.openFolder')
        break
      case 'file.save':
        requestIdeSave()
        break
      case 'file.preferences':
        navigate(SETTINGS_ROUTE)
        break
      case 'help.about':
        navigate(`${SETTINGS_ROUTE}?tab=about`)
        break
      case 'help.releaseNotes':
      case 'help.updates':
        navigate(`${SETTINGS_ROUTE}?tab=about&page=updates`)
        break
      case 'file.closeTab':
        runIdeCommand('file.closeTab')
        break
      case 'file.closeWindow':
      case 'file.exit':
        window.close()
        break
      case 'edit.undo':
        editorUndo()
        break
      case 'edit.redo':
        editorRedo()
        break
      case 'edit.cut':
        editorClipboard('cut')
        break
      case 'edit.copy':
        editorClipboard('copy')
        break
      case 'edit.paste':
        editorClipboard('paste')
        break
      case 'edit.find':
        editorFind(ask(t.ide.menu.prompts.find))
        break
      case 'edit.replace': {
        const from = ask(t.ide.menu.prompts.replaceFrom)
        const to = from ? ask(t.ide.menu.prompts.replaceTo) : ''

        if (from) {
          editorReplace(from, to)
        }
        break
      }
      case 'edit.findFiles':
      case 'view.search':
        runIdeCommand('view.search')
        break
      case 'edit.replaceFiles':
        runIdeCommand('edit.replaceFiles')
        break
      case 'edit.format':
        editorFormatDocument()
        break
      case 'edit.comment':
        editorToggleComment()
        break
      case 'edit.blockComment':
        editorToggleBlockComment()
        break
      case 'selection.all':
        editorSelectAll()
        break
      case 'selection.expand':
        editorExpandSelection()
        break
      case 'selection.copyUp':
        editorCopyLineUp()
        break
      case 'selection.copyDown':
        editorCopyLineDown()
        break
      case 'selection.moveUp':
        editorMoveLineUp()
        break
      case 'selection.moveDown':
        editorMoveLineDown()
        break
      case 'selection.cursorAbove':
        editorCursorAbove()
        break
      case 'selection.cursorBelow':
        editorCursorBelow()
        break
      case 'selection.nextOccurrence':
        editorNextOccurrence()
        break
      case 'selection.prevOccurrence':
        editorPrevOccurrence()
        break
      case 'selection.allOccurrences':
        editorAllOccurrences()
        break
      case 'selection.column':
        editorToggleColumnSelection()
        break
      case 'view.command':
      case 'help.commands':
        openCommandPalette()
        break
      case 'view.files':
        runIdeCommand('view.files')
        break
      case 'view.git':
        runIdeCommand('view.git')
        break
      case 'view.run':
        runIdeCommand('view.run')
        break
      case 'view.extensions':
        runIdeCommand('view.extensions')
        break
      case 'view.wordWrap':
        editorToggleWordWrap()
        break
      case 'view.problems':
        runIdeCommand('view.problems')
        break
      case 'view.output':
        runIdeCommand('view.output')
        break
      case 'view.debug':
        runIdeCommand('view.debug')
        break
      case 'view.terminal':
        runIdeCommand('view.terminalShow')
        break
      case 'terminal.new':
        runIdeCommand('terminal.new')
        break
      case 'go.back':
        ideBack()
        break
      case 'go.forward':
        ideForward()
        break
      case 'go.file':
        requestIdeQuickOpen()
        break
      case 'go.definition':
        editorGoToDefinition()
        break
      case 'go.references':
        editorFindReferences()
        break
      case 'go.nextProblem':
        editorNextProblem()
        break
      case 'go.prevProblem':
        editorPrevProblem()
        break
      case 'go.line': {
        const line = Number(ask(t.ide.menu.prompts.line))

        if (line > 0) {
          editorGotoLine(line)
        }
        break
      }
      case 'go.bracket':
        editorMatchingBracket()
        break
      case 'run.start':
        void debugStart(false)
        break
      case 'run.without':
        void debugStart(true)
        break
      case 'run.stop':
        void debugStop()
        break
      case 'run.restart':
        void debugRestart()
        break
      case 'run.continue':
        void debugContinue()
        break
      case 'run.stepOver':
        void debugStep('next')
        break
      case 'run.stepInto':
        void debugStep('stepIn')
        break
      case 'run.stepOut':
        void debugStep('stepOut')
        break
      case 'run.breakpoint':
        editorToggleBreakpoint()
        break
      case 'run.newBreakpoint': {
        const editor = $ideEditor.get()
        const condition = ask(t.ide.breakpointCondition)

        if (editor && condition) {
          toggleIdeBreakpoint(editor.path, editor.line, condition)
        }
        break
      }
      case 'run.enableBreakpoints':
        setAllBreakpointsEnabled(true)
        break
      case 'run.disableBreakpoints':
        setAllBreakpointsEnabled(false)
        break
      case 'run.removeBreakpoints':
        clearIdeBreakpoints()
        break
      case 'help.issue':
        openLink('https://github.com/NousResearch/hermes-agent/issues')
        break
      case 'help.license':
        openLink('https://github.com/NousResearch/hermes-agent/blob/main/LICENSE')
        break
      default:
        break
    }
  }

  return (
    <div className="mr-2 flex h-6 items-center [-webkit-app-region:no-drag]" ref={rootRef}>
      {MENUS.map(menu => (
        <div className="relative" key={menu.id}>
          <button
            className={cn(
              'h-6 rounded px-2 text-[12px] text-muted-foreground hover:bg-(--ui-control-hover-background) hover:text-foreground',
              open === menu.id && 'bg-(--ui-control-hover-background) text-foreground'
            )}
            onClick={() => {
              setRecent(false)
              setOpen(current => (current === menu.id ? null : menu.id))
            }}
            onPointerDown={event => event.stopPropagation()}
            type="button"
          >
            {t.ide.menu[menu.label]}
          </button>
          {open === menu.id && (
            <div className="absolute top-7 left-0 z-80 min-w-64 rounded-md border border-(--ui-stroke-secondary) bg-background py-1 shadow-md">
              {menu.rows.map((row, index) => {
                if (row === 'sep') {
                  return <div className="my-1 h-px bg-(--ui-stroke-secondary)" key={`sep-${index}`} />
                }

                if (row === 'recent') {
                  const empty = timeline.length === 0

                  return (
                    <div className="relative" key="recent">
                      <MenuButton
                        disabled={empty}
                        label={t.ide.menu.items['file.recent']}
                        onOpen={() => setRecent(openRecent => !openRecent)}
                        unavailable={t.ide.menu.unavailable}
                      />
                      {recent && !empty && (
                        <div className="absolute top-0 left-full z-80 ml-1 max-h-64 w-56 overflow-auto rounded-md border border-(--ui-stroke-secondary) bg-background py-1 shadow-md">
                          {timeline.slice(0, 8).map(item => (
                            <button
                              className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background)"
                              key={item.path}
                              onClick={() => {
                                setOpen(null)
                                setRecent(false)
                                requestIdeOpen(item.path)
                              }}
                              onPointerDown={event => event.preventDefault()}
                              title={item.path}
                              type="button"
                            >
                              {fileName(item.path)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <MenuButton
                    disabled={!row.enabled}
                    key={row.id}
                    label={t.ide.menu.items[row.id] || row.id}
                    onOpen={() => run(row.id)}
                    shortcut={row.shortcut}
                    unavailable={t.ide.menu.unavailable}
                  />
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MenuButton({
  disabled,
  label,
  onOpen,
  shortcut,
  unavailable
}: {
  disabled: boolean
  label: string
  onOpen: () => void
  shortcut?: string
  unavailable: string
}) {
  return (
    <button
      aria-disabled={disabled}
      className={cn(
        'flex w-full items-center gap-6 px-3 py-1.5 text-left text-xs',
        disabled
          ? 'cursor-default text-muted-foreground/50'
          : 'text-foreground hover:bg-(--ui-control-hover-background)'
      )}
      onClick={() => {
        if (!disabled) {
          onOpen()
        }
      }}
      onPointerDown={event => event.preventDefault()}
      title={disabled ? unavailable : undefined}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <span className="shrink-0 text-[10px] text-muted-foreground">{shortcut}</span>}
    </button>
  )
}
