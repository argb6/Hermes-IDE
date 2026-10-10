import { useStore } from '@nanostores/react'
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

import { PreviewPane } from '@/app/chat/right-rail/preview-pane'
import { WiredPane } from '@/app/contrib/context'
import { ReviewPane } from '@/app/right-sidebar/review'
import { $terminalInjection } from '@/app/right-sidebar/store'
import { createTerminal, ensureTerminal } from '@/app/right-sidebar/terminal/terminals'
import { Backdrop } from '@/components/Backdrop'
import { Wordmark } from '@/components/chat/wordmark'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { writeDesktopFileText } from '@/lib/desktop-fs'
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview'
import { cn } from '@/lib/utils'
import { $repoStatusByCwd, registerRepoStatusCwd } from '@/store/coding-status'
import { notifyError } from '@/store/notifications'
import { type PreviewTarget } from '@/store/preview'
import { openFolderAsProject, pickProjectFolder } from '@/store/projects'
import { $reviewOpen, revealReview } from '@/store/review'
import { $dirtyPreviewUrls } from '@/store/preview-edit'
import { $focusedWorkspaceCwd } from '@/store/session-states'
import { $workspaceChangeTick } from '@/store/workspace-events'

import type { ExtensionRow } from './ext-client'
import { IdeActivityBar, type IdePanel } from './ide-activity'
import { IdeChatHeader } from './ide-chats'
import { $ideCommand } from './ide-commands'
import { IdeConflict } from './ide-conflict'
import {
  closeIdeDocument,
  markIdeDocumentClean,
  markIdeDocumentDirty,
  openIdeDocument
} from './ide-documents'
import { $ideSaveRequest, noteIdeEditor } from './ide-editor'
import { lspStart } from './lsp-client'
import { setActiveIdeEditorGroup, syncIdeEditorGroup } from './ide-editor-groups'
import { IdeExplorer } from './ide-explorer'
import { IdeExtensionDetail } from './ide-extension-detail'
import { IdeGit } from './ide-git'
import { GITHUB_LOGIN_COMMAND, IdeGithub } from './ide-github'
import { $ideOpenPath, $ideReveal, $ideSideTick, noteIdeFile, noteIdeTimeline, requestIdeGoto, setIdeTitle, takeIdeHistoryMove } from './ide-nav'
import { appendIdeOutput } from './ide-output'
import { IdePanel as IdeBottomPanel, type IdeBottomTab } from './ide-panel'
import { IdeDebugSidebar, IdeDebugToolbar } from './ide-debug'
import { ensureDebugEvents } from './ide-debug-session'
import { IdeExtensions, toggleExtension } from './ide-extensions'
import { IdeSearch } from './ide-search'
import { $debugPhase, $ideExtensionAction, noteIdeExtensionChange, openIdeSearchReplace, problemStoreForPath } from './ide-state'
import {
  $ideRecentFolders,
  noteIdeRecentFolder,
  readIdeLayout,
  readIdeTabs,
  writeIdeLayout,
  writeIdeTabs
} from './ide-session'
import { $ideShell } from './ide-shells'
import { IdeStatusBar } from './ide-status'

interface OpenTab {
  dirty?: boolean
  id: string
  target: PreviewTarget
}

const GITHUB_CLONE_RE = /^(?:https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?\/?|git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?)$/i

// JavaScript and TypeScript share one server; starting each id is idempotent.
// The agent bridge never calls lsp:start, so the workspace open has to.
const WORKSPACE_LSP_LANGUAGES = ['python', 'typescript', 'javascript', 'typescriptreact', 'javascriptreact'] as const

const PANEL_TITLE: Record<IdePanel, 'explorer' | 'extensions' | 'git' | 'github' | 'run' | 'search'> = {
  extensions: 'extensions',
  files: 'explorer',
  git: 'git',
  github: 'github',
  run: 'run',
  search: 'search'
}

const SIZE_KEY = 'hermes.desktop.ide.sizes'

function readSize(key: 'chat' | 'side' | 'split' | 'terminal', fallback: number, min: number, max: number) {
  try {
    const raw = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}') as Record<string, number>
    const value = raw[key]

    if (typeof value === 'number' && value >= min && value <= max) {
      return value
    }
  } catch {
    // A bad saved size falls back to the default.
  }

  return fallback
}

function writeSize(key: 'chat' | 'side' | 'split' | 'terminal', value: number) {
  const current = (() => {
    try {
      return JSON.parse(localStorage.getItem(SIZE_KEY) || '{}') as Record<string, number>
    } catch {
      return {}
    }
  })()

  localStorage.setItem(SIZE_KEY, JSON.stringify({ ...current, [key]: value }))
}

/** VS Code arrangement: activity bar, side bar, editor tabs, chat on the right. */
export function IdeWorkspace() {
  const cwd = useStore($focusedWorkspaceCwd)
  const debugPhase = useStore($debugPhase)
  const recentFolders = useStore($ideRecentFolders)
  const byCwd = useStore($repoStatusByCwd)
  const saved = useRef(readIdeLayout())
  const [panel, setPanel] = useState<IdePanel>(() => (saved.current.panel as IdePanel) || 'files')
  const [sideOpen, setSideOpen] = useState(() => saved.current.sideOpen)
  const [chatOpen, setChatOpen] = useState(() => saved.current.chatOpen)
  const [rightTab, setRightTab] = useState<'changes' | 'chat'>(() => saved.current.rightTab)
  const reviewOpen = useStore($reviewOpen)
  // Starts from the current value: a persisted-open review on boot is not a
  // fresh "opened now" and must not flip the chat column to the diff.
  const reviewWasOpen = useRef(reviewOpen)
  const [terminalOpen, setTerminalOpen] = useState(() => saved.current.terminalOpen)
  const [bottomTab, setBottomTab] = useState<IdeBottomTab>(() => (saved.current.bottomTab as IdeBottomTab) || 'terminal')
  const [sideWidth, setSideWidth] = useState(() => readSize('side', 256, 160, 520))
  const [chatWidth, setChatWidth] = useState(() => readSize('chat', 360, 280, 640))
  const [terminalHeight, setTerminalHeight] = useState(() => readSize('terminal', 192, 96, 520))
  const [detail, setDetail] = useState<null | ExtensionRow>(null)
  const [diff, setDiff] = useState<null | string>(null)
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeId, setActiveId] = useState<null | string>(null)
  const [split, setSplit] = useState(false)
  const [splitRatio, setSplitRatio] = useState(() => readSize('split', 0.5, 0.25, 0.75))
  const [secondaryTabs, setSecondaryTabs] = useState<OpenTab[]>([])
  const [secondaryId, setSecondaryId] = useState<null | string>(null)
  const splitHostRef = useRef<HTMLDivElement | null>(null)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const restoredTabs = useRef(false)
  const { t } = useI18n()
  const active = tabs.find(tab => tab.id === activeId) ?? null
  const secondary = secondaryTabs.find(tab => tab.id === secondaryId) ?? null

  const folder =
    cwd
      ?.split(/[\\/]+/)
      .filter(Boolean)
      .pop() ?? ''

  const conflicted = Boolean(
    active?.target.path &&
      (byCwd[cwd || '']?.files ?? []).some(file => file.conflicted && absEndsWith(cwd, file.path, active.target.path || ''))
  )

  useEffect(() => registerRepoStatusCwd(cwd), [cwd])

  useEffect(() => {
    ensureDebugEvents()
  }, [])

  useEffect(() => {
    if (cwd) {
      noteIdeRecentFolder(cwd)

      for (const language of WORKSPACE_LSP_LANGUAGES) {
        void lspStart({ language, workspaceRoot: cwd })
      }
    }
  }, [cwd])

  useEffect(() => {
    writeIdeLayout({
      bottomTab,
      chatOpen,
      panel,
      rightTab,
      sideOpen,
      terminalOpen
    })
  }, [bottomTab, chatOpen, panel, rightTab, sideOpen, terminalOpen])

  useEffect(() => {
    writeIdeTabs(tabs.map(tab => tab.target.path).filter((path): path is string => Boolean(path)))
  }, [tabs])

  useEffect(() => {
    setIdeTitle(folder)
  }, [folder])

  useEffect(() => {
    syncIdeEditorGroup(
      'primary',
      tabs.map(tab => tab.id),
      activeId
    )
  }, [activeId, tabs])

  useEffect(() => {
    syncIdeEditorGroup(
      'secondary',
      secondaryTabs.map(tab => tab.id),
      secondaryId
    )
  }, [secondaryId, secondaryTabs])

  useEffect(() => {
    return $workspaceChangeTick.subscribe(() => {
      setTabs(current =>
        current.map(tab => {
          if (tab.target.path) {
            markIdeDocumentDirty(tab.target.path)
          }

          return tab.target.path ? { ...tab, dirty: true } : tab
        })
      )
      setSecondaryTabs(current =>
        current.map(tab => {
          if (tab.target.path) {
            markIdeDocumentDirty(tab.target.path)
          }

          return tab.target.path ? { ...tab, dirty: true } : tab
        })
      )
      setChatOpen(true)
      // The review is a destination, not a hijacker: files changing in the
      // background never steal the chat column. If the user is already
      // reviewing, keep that diff live against this workspace instead.
      if ($reviewOpen.get()) {
        revealReview(cwd)
      }
    })
  }, [cwd])

  useEffect(() => {
    let seen = $ideSaveRequest.get()

    return $ideSaveRequest.subscribe(tick => {
      if (tick === seen) {
        return
      }

      seen = tick
      const path = active?.target.path

      if (!path) {
        return
      }

      markIdeDocumentClean(path)
      setTabs(current => current.map(tab => (tab.target.path === path ? { ...tab, dirty: false } : tab)))
      setSecondaryTabs(current => current.map(tab => (tab.target.path === path ? { ...tab, dirty: false } : tab)))
    })
  }, [active?.target.path])

  useEffect(() => {
    if (!active) {
      noteIdeEditor(null)
    }
  }, [active])

  useEffect(() => {
    if (!activeId || takeIdeHistoryMove()) {
      return
    }

    noteIdeFile(activeId)
  }, [activeId])

  useEffect(() => {
    return $ideSideTick.listen(tick => {
      if (tick > 0) {
        setSideOpen(open => !open)
      }
    })
  }, [])

  useEffect(() => {
    return $ideReveal.listen(reveal => {
      if (!reveal) {
        return
      }

      setDetail(null)
      setDiff(null)
      setActiveId(reveal.id)
    })
  }, [])

  // Row buttons and the detail view ask here. The workspace is always
  // mounted, so the detail's install/uninstall keeps working even with the
  // extensions panel closed.
  useEffect(() => {
    return $ideExtensionAction.listen(row => {
      if (!row) {
        return
      }

      void (async () => {
        const outcome = await toggleExtension(row)

        if (outcome.status === 'rejected') {
          const fields = outcome.fields?.length ? ` (${outcome.fields.join(', ')})` : ''

          notifyError(new Error(`${t.ide.extensionsRejected}${fields}`), t.ide.extensions)

          return
        }

        if (outcome.status === 'offline') {
          notifyError(new Error(t.ide.extensionsUnavailable), t.ide.extensions)

          return
        }

        setDetail(current => (current?.id === row.id ? { ...row, installed: outcome.status === 'installed' } : current))
        noteIdeExtensionChange()
      })()
    })
  }, [t])

  useEffect(() => {
    if (reviewOpen) {
      reviewWasOpen.current = true
      setChatOpen(true)
      setRightTab('changes')

      return
    }

    if (reviewWasOpen.current) {
      reviewWasOpen.current = false
      setRightTab('chat')
    }
  }, [reviewOpen])

  const showPanel = (next: IdePanel) => {
    setPanel(next)
    setSideOpen(true)

    if (next !== 'git') {
      setDiff(null)
    }
  }

  const showFile = async (path: string, options?: { quiet?: boolean; secondary?: boolean }) => {
    try {
      const preview = await normalizeOrLocalPreviewTarget(path, cwd || undefined)

      if (!preview) {
        throw new Error(path)
      }

      const id = preview.path || preview.url

      setDetail(null)
      setDiff(null)

      if (options?.secondary) {
        setSecondaryTabs(current => (current.some(tab => tab.id === id) ? current : [...current, { id, target: preview }]))
        setSecondaryId(id)
        setSplit(true)
        setActiveIdeEditorGroup('secondary')
      } else {
        setTabs(current => (current.some(tab => tab.id === id) ? current : [...current, { id, target: preview }]))
        setActiveId(id)
        setActiveIdeEditorGroup('primary')
      }

      if (preview.path) {
        openIdeDocument(preview.path)
        noteIdeTimeline(preview.path)
      }
    } catch (error) {
      if (!options?.quiet) {
        notifyError(error, t.rightSidebar.previewUnavailable)
      }
    }
  }

  const showFileRef = useRef(showFile)
  showFileRef.current = showFile

  useEffect(() => {
    if (restoredTabs.current) {
      return
    }

    restoredTabs.current = true
    const savedTabs = readIdeTabs()

    if (savedTabs.length === 0) {
      return
    }

    void (async () => {
      for (const row of savedTabs) {
        await showFileRef.current(row.path, { quiet: true })
      }
    })()
  }, [])

  useEffect(() => {
    return $ideOpenPath.listen(request => {
      if (request) {
        void showFileRef.current(request.path)
      }
    })
  }, [])

  const cloneRepo = async () => {
    const url = window.prompt(t.ide.clonePrompt)?.trim()

    if (!url) {
      return
    }

    if (!GITHUB_CLONE_RE.test(url.replace(/\/$/, ''))) {
      notifyError(new Error(t.ide.cloneInvalid), t.ide.cloneInvalid)

      return
    }

    const parent = await pickProjectFolder()

    if (!parent) {
      return
    }

    const name = url
      .replace(/\.git$/i, '')
      .split(/[/:]/)
      .filter(Boolean)
      .pop()
    const dest = `${parent.replace(/[/\\]+$/, '')}\\${name}`

    setBottomTab('output')
    setTerminalOpen(true)
    appendIdeOutput(`git clone -- ${url} ${dest}`)
    ensureTerminal()
    $terminalInjection.set(
      `git clone -- ${JSON.stringify(url)} ${JSON.stringify(dest)}; if ($LASTEXITCODE -eq 0) { Set-Location -LiteralPath ${JSON.stringify(dest)} }`
    )

    const opened = await waitForGitClone(dest)

    if (opened) {
      appendIdeOutput(t.ide.cloneOpened.replace('{path}', dest))
      await openFolderAsProject(dest)
    } else {
      appendIdeOutput(t.ide.cloneTimedOut)
      notifyError(new Error(t.ide.cloneTimedOut), t.ide.cloneTimedOut)
    }
  }

  const splitActiveRight = () => {
    if (!active) {
      return
    }

    setSplit(true)
    setSecondaryTabs(current => (current.some(tab => tab.id === active.id) ? current : [...current, active]))
    setSecondaryId(active.id)
  }

  const openGithubDoc = async (title: string, markdown: string) => {
    const root = (cwd || (await pickProjectFolder()) || '').replace(/[/\\]+$/, '')

    if (!root) {
      return
    }

    const safe = title.replace(/[^\w.#-]+/g, '_').slice(0, 80)
    const path = `${root}\\.hermes-ide\\${safe}.md`

    try {
      await writeDesktopFileText(path, markdown)
      await showFile(path)
    } catch (error) {
      notifyError(error, t.rightSidebar.previewUnavailable)
    }
  }

  const closeTab = (id: string) => {
    setTabs(current => {
      const closing = current.find(tab => tab.id === id)

      if (closing?.target.path) {
        closeIdeDocument(closing.target.path)
      }

      const index = current.findIndex(tab => tab.id === id)
      const next = current.filter(tab => tab.id !== id)

      if (activeId === id) {
        const fallback = next[Math.min(index, next.length - 1)] ?? null

        setActiveId(fallback?.id ?? null)
      }

      return next
    })
  }

  useEffect(() => {
    return $ideCommand.listen(command => {
      if (!command) {
        return
      }

      switch (command.name) {
        case 'file.openFolder':
          void openFolderAsProject()
          break
        case 'file.closeTab':
          if (activeId) {
            closeTab(activeId)
          }
          break
        case 'selection.all':
          document.execCommand('selectAll')
          break
        case 'view.files':
          showPanel('files')
          break
        case 'view.search':
        case 'go.search':
          showPanel('search')
          break
        case 'edit.replaceFiles':
          openIdeSearchReplace()
          showPanel('search')
          break
        case 'view.run':
          showPanel('run')
          break
        case 'view.extensions':
          showPanel('extensions')
          break
        case 'view.git':
        case 'go.git':
          showPanel('git')
          break
        case 'view.github':
          showPanel('github')
          break
        case 'view.chat':
          setChatOpen(open => !open)
          break
        case 'view.terminal':
        case 'terminal.toggle':
          setTerminalOpen(open => !open)
          break
        case 'view.terminalShow':
          setTerminalOpen(true)
          setBottomTab('terminal')
          break
        case 'view.problems':
          setTerminalOpen(true)
          setBottomTab('problems')
          break
        case 'view.output':
          setTerminalOpen(true)
          setBottomTab('output')
          break
        case 'view.debug':
          setTerminalOpen(true)
          setBottomTab('debug')
          break
        case 'run.terminal':
          setTerminalOpen(true)
          break
        case 'terminal.new':
          setTerminalOpen(true)
          createTerminal($focusedWorkspaceCwd.get() || undefined, $ideShell.get())
          break
        default:
          break
      }
    })
  }, [activeId])

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col bg-(--ui-bg-chrome)">
      {/* The statue fill owns the whole page — every region wears it, and the
          panes read apart by surface shade underneath it. */}
      <Backdrop force />
      <div className="flex min-h-0 flex-1">
        <IdeActivityBar
          onPanel={next => {
            if (next === panel && sideOpen) {
              setSideOpen(false)

              return
            }

            showPanel(next)
          }}
          panel={panel}
          sideOpen={sideOpen}
        />
        {/* Everything right of the activity bar shares one surface family;
            titlebar stays outside IdeShell padding, activity bar stays chrome. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="relative z-1 flex min-h-0 min-w-0 flex-1">
        {sideOpen && (
          <>
            <div
              className="relative z-1 flex h-full shrink-0 flex-col bg-(--ui-sidebar-surface-background)/90"
              style={{ width: sideWidth }}
            >
              <div className="flex h-9 shrink-0 items-center px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t.ide[PANEL_TITLE[panel]]}
              </div>
              <div className="min-h-0 flex-1">
              {panel === 'files' && (
                <IdeExplorer
                  activePath={active?.target.path ?? null}
                  cwd={cwd}
                  onDiff={setDiff}
                  onOpen={path => void showFile(path)}
                />
              )}
                {panel === 'search' && (
                  <IdeSearch
                    cwd={cwd}
                    onOpen={(path, line, column) => {
                      if (line) {
                        requestIdeGoto(path, line, column)

                        return
                      }

                      void showFile(path)
                    }}
                  />
                )}
                {panel === 'run' && <IdeDebugSidebar />}
                {panel === 'extensions' && <IdeExtensions detailId={detail?.id ?? null} onDetail={setDetail} />}
                {panel === 'git' && <IdeGit cwd={cwd} onDiff={setDiff} />}
                {panel === 'github' && (
                <IdeGithub
                  cwd={cwd}
                  onClone={() => void cloneRepo()}
                  onComment={(number, body) => {
                    setTerminalOpen(true)
                    ensureTerminal()
                    $terminalInjection.set(`gh pr comment ${number} --body ${JSON.stringify(body)}`)
                  }}
                  onLogin={() => {
                    setTerminalOpen(true)
                    ensureTerminal()
                    $terminalInjection.set(GITHUB_LOGIN_COMMAND)
                  }}
                  onOpen={path => void showFile(path)}
                  onOpenDoc={(title, markdown) => void openGithubDoc(title, markdown)}
                  onPull={() => {
                    if (!cwd) {
                      return
                    }

                    setTerminalOpen(true)
                    ensureTerminal()
                    $terminalInjection.set('git pull --ff-only')
                  }}
                  onPush={() => {
                    if (!cwd) {
                      return
                    }

                    setTerminalOpen(true)
                    ensureTerminal()
                    $terminalInjection.set('git push')
                  }}
                />
              )}
              </div>
            </div>
            <PaneSash
              axis="x"
              onResize={delta =>
                setSideWidth(current => {
                  const next = clamp(current + delta, 160, 520)

                  writeSize('side', next)

                  return next
                })
              }
            />
          </>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-(--ui-surface-background)">
          {(debugPhase !== 'idle' || panel === 'run') && <IdeDebugToolbar className="bg-(--ui-bg-chrome)/90" />}
          <div className={cn('flex min-h-0 flex-1', split && 'gap-0')} ref={splitHostRef}>
            <div className="flex min-h-0 min-w-0" style={split ? { width: `${splitRatio * 100}%` } : { flex: 1 }}>
              <IdeEditor
                active={active}
                conflicted={conflicted}
                cwd={cwd}
                detail={detail}
                diff={diff}
                onClone={() => void cloneRepo()}
                onClose={closeTab}
                onMarkClean={path => {
                  markIdeDocumentClean(path)
                  setTabs(current => current.map(tab => (tab.target.path === path ? { ...tab, dirty: false } : tab)))
                  setSecondaryTabs(current =>
                    current.map(tab => (tab.target.path === path ? { ...tab, dirty: false } : tab))
                  )
                }}
                onOpenRecent={path => void openFolderAsProject(path)}
                onSelect={id => {
                  setDetail(null)
                  setDiff(null)
                  setActiveId(id)
                }}
                onSplit={splitActiveRight}
                recentFolders={recentFolders}
                tabs={tabs}
              />
            </div>
            {split && (
              <>
                <PaneSash
                  axis="x"
                  onResize={delta => {
                    const width = splitHostRef.current?.clientWidth || 0

                    if (width <= 0) {
                      return
                    }

                    setSplitRatio(current => {
                      const next = clamp(current + delta / width, 0.25, 0.75)

                      writeSize('split', next)

                      return next
                    })
                  }}
                />
                <div className="flex min-h-0 min-w-0 flex-1">
                  <IdeEditor
                    active={secondary}
                    cwd={cwd}
                    detail={null}
                    diff={null}
                    onClone={() => void cloneRepo()}
                    onClose={id => {
                      setSecondaryTabs(current => {
                        const next = current.filter(tab => tab.id !== id)

                        if (secondaryId === id) {
                          setSecondaryId(next[0]?.id ?? null)
                        }

                        if (next.length === 0) {
                          setSplit(false)
                        }

                        return next
                      })
                    }}
                    onOpenRecent={path => void openFolderAsProject(path)}
                    onSelect={id => setSecondaryId(id)}
                    recentFolders={recentFolders}
                    tabs={secondaryTabs}
                  />
                </div>
              </>
            )}
          </div>
          {terminalOpen && (
            <>
              <PaneSash
                axis="y"
                onResize={delta =>
                  setTerminalHeight(current => {
                    const next = clamp(current - delta, 96, 520)

                    writeSize('terminal', next)

                    return next
                  })
                }
              />
              <div
                className="flex shrink-0 bg-(--ui-terminal-surface-background)"
                style={{ height: terminalHeight }}
              >
                <IdeBottomPanel
                  cwd={cwd}
                  fileName={active?.target.label || active?.target.path?.split(/[\\/]/).pop()}
                  onClose={() => setTerminalOpen(false)}
                  onTab={setBottomTab}
                  tab={bottomTab}
                />
              </div>
            </>
          )}
        </div>
        {chatOpen && (
          <>
            <PaneSash
              axis="x"
              onResize={delta =>
                setChatWidth(current => {
                  const next = clamp(current - delta, 280, 640)

                  writeSize('chat', next)

                  return next
                })
              }
            />
            <div
              className="relative z-1 flex h-full shrink-0 flex-col bg-(--ui-chat-surface-background)/90"
              style={{ width: chatWidth }}
            >
              <IdeChatHeader
                changesOpen={rightTab === 'changes'}
                folder={folder}
                onChanges={() => {
                  setRightTab('changes')
                  revealReview(cwd)
                }}
                onClose={() => setChatOpen(false)}
                onShowChat={() => setRightTab('chat')}
              />
              <div className="min-h-0 flex-1">
                {rightTab === 'changes' ? <ReviewPane embedded /> : <WiredPane part="chatRoutes" />}
              </div>
            </div>
          </>
        )}
          </div>
          <IdeStatusBar
            cwd={cwd}
            folder={folder}
            onOpenProblems={() => {
              setBottomTab('problems')
              setTerminalOpen(true)
            }}
            onOpenTerminal={() => {
              setTerminalOpen(true)
              createTerminal(cwd || undefined, $ideShell.get())
            }}
            terminalOpen={terminalOpen}
          />
        </div>
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** A file name that turns red with the file's error count beside it — the same
 *  problem marking the file tree rows wear. */
function TabFileLabel({ label, path }: { label: string; path: null | string }) {
  const problems = useStore(problemStoreForPath(path ?? ''))

  return (
    <>
      <span className={cn('truncate', problems.errors > 0 && 'text-[#f14c4c]')}>{label}</span>
      {problems.errors > 0 && <span className="shrink-0 text-[10px] font-medium text-[#f14c4c]">{problems.errors}</span>}
      {problems.warnings > 0 && (
        <span className="shrink-0 text-[10px] font-medium text-[#cca700]">{problems.warnings}</span>
      )}
    </>
  )
}

function PaneSash({ axis, onResize }: { axis: 'x' | 'y'; onResize: (delta: number) => void }) {
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    let last = axis === 'x' ? event.clientX : event.clientY

    const move = (next: PointerEvent) => {
      const point = axis === 'x' ? next.clientX : next.clientY

      onResize(point - last)
      last = point
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className={cn(
        'group relative shrink-0 [-webkit-app-region:no-drag]',
        axis === 'x' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      )}
      onPointerDown={drag}
      role="separator"
    >
      {/* Regions read apart by surface shade; the seam itself only shows when
          the pointer comes near — a hairline that lifts to full strength plus
          the thicker accent grab band, same treatment as the agent surface's
          split sash (pane-shell/tree-split). */}
      <span
        className={cn(
          'absolute bg-(--ui-stroke-secondary) opacity-0 transition-opacity duration-100 group-hover:opacity-100',
          axis === 'x' ? 'inset-y-0 left-1/2 w-px -translate-x-1/2' : 'inset-x-0 top-1/2 h-px -translate-y-1/2'
        )}
      />
      <span
        className={cn(
          'absolute bg-(--ui-sash-hover-border) opacity-0 transition-opacity duration-100 group-hover:opacity-100',
          axis === 'x' ? 'inset-y-0 left-1/2 w-1 -translate-x-1/2' : 'inset-x-0 top-1/2 h-1 -translate-y-1/2'
        )}
      />
    </div>
  )
}

function IdeEditor({
  active,
  conflicted,
  cwd,
  detail,
  diff,
  recentFolders,
  tabs,
  onClone,
  onClose,
  onMarkClean,
  onOpenRecent,
  onSelect,
  onSplit
}: {
  active: null | OpenTab
  conflicted?: boolean
  cwd: null | string
  detail: null | ExtensionRow
  diff: null | string
  recentFolders: { at: number; path: string }[]
  tabs: OpenTab[]
  onClone: () => void
  onClose: (id: string) => void
  onMarkClean?: (path: string) => void
  onOpenRecent: (path: string) => void
  onSelect: (id: string) => void
  onSplit?: () => void
}) {
  const { t } = useI18n()
  const dirtyUrls = useStore($dirtyPreviewUrls)

  const folder =
    cwd
      ?.split(/[\\/]+/)
      .filter(Boolean)
      .pop() ?? ''

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-transparent">
      {tabs.length > 0 && (
        <div className="flex h-9 shrink-0 items-stretch overflow-x-auto bg-(--ui-bg-chrome)/90">
          {tabs.map(tab => {
            const selected = tab.id === active?.id && !diff && !detail

            return (
              <div
                className={cn(
                  'group flex max-w-52 min-w-0 items-center border-r border-(--ui-stroke-secondary)',
                  selected ? 'bg-background/90 text-foreground' : 'text-muted-foreground'
                )}
                key={tab.id}
              >
                <button
                  className="flex h-9 min-w-0 flex-1 items-center gap-1 truncate px-3 text-left text-xs"
                  onClick={() => onSelect(tab.id)}
                  type="button"
                >
                  {(tab.dirty || Boolean(dirtyUrls[tab.target.url])) && (
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#e2c08d]" />
                  )}
                  <TabFileLabel label={tab.target.label} path={tab.target.path ?? null} />
                </button>
                <button
                  aria-label={t.ide.closeTab}
                  className="mr-1 flex size-5 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-(--ui-control-hover-background)"
                  onClick={() => onClose(tab.id)}
                  type="button"
                >
                  <Codicon name="close" size={12} />
                </button>
              </div>
            )
          })}
          {onSplit && active && (
            <button
              className="ml-auto flex h-9 shrink-0 items-center gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onSplit}
              title={t.ide.splitEditor}
              type="button"
            >
              <Codicon name="split-horizontal" size={14} />
              {t.ide.splitEditor}
            </button>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {detail ? (
          <IdeExtensionDetail row={detail} />
        ) : diff ? (
          <pre className="h-full overflow-auto p-3 text-xs whitespace-pre-wrap">{diff}</pre>
        ) : conflicted && active?.target.path && cwd ? (
          <IdeConflict
            cwd={cwd}
            onSaved={() => {
              const path = active.target.path

              if (path) {
                onMarkClean?.(path)
              }
            }}
            path={active.target.path}
          />
        ) : active ? (
          <PreviewPane embedded onClose={() => onClose(active.id)} target={active.target} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            {/* Page furniture: the lettering is anchored to the window, not to
                this area, so dragging a sash or toggling a pane never slides
                or rescales it. Painted under the panes, so it lives wherever
                the file preview area shows through. */}
            <Wordmark
              className="pointer-events-none fixed left-1/2 top-[24%] -translate-x-1/2"
              text="HERMES AGENT"
              width="min(36rem, 52vw)"
            />
            <div className="w-full max-w-2xl min-w-0 px-2">
              {folder ? (
                <p className="m-0 text-sm text-foreground">{folder}</p>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">{t.ide.emptyBody}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => void openFolderAsProject()} size="sm" variant="secondary">
                {t.ide.openFolder}
              </Button>
              <Button onClick={onClone} size="sm" variant="secondary">
                {t.ide.cloneRepo}
              </Button>
            </div>
            {recentFolders.length > 0 && (
              <div className="mt-1 w-full max-w-sm text-left">
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t.ide.recentFolders}
                </p>
                {recentFolders.map(row => (
                  <button
                    className="flex h-7 w-full items-center truncate rounded px-2 text-left text-xs text-muted-foreground hover:bg-(--ui-control-hover-background) hover:text-foreground"
                    key={row.path}
                    onClick={() => onOpenRecent(row.path)}
                    title={row.path}
                    type="button"
                  >
                    {row.path}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function absEndsWith(cwd: null | string, relative: string, absolute: string) {
  const left = `${(cwd || '').replace(/\\/g, '/')}/${relative.replace(/\\/g, '/')}`.replace(/\/+/g, '/').toLowerCase()
  const right = absolute.replace(/\\/g, '/').toLowerCase()

  return right === left || right.endsWith(`/${relative.replace(/\\/g, '/').toLowerCase()}`)
}

/** Poll until `gitRoot(dest)` resolves — clone finished enough to open as a project. */
async function waitForGitClone(dest: string, timeoutMs = 600_000): Promise<boolean> {
  const gitRoot = window.hermesDesktop?.gitRoot

  if (!gitRoot) {
    return false
  }

  const target = dest.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    try {
      const root = await gitRoot(dest)

      if (root) {
        const normalized = root.replace(/[/\\]+$/, '').replace(/\\/g, '/').toLowerCase()

        if (normalized === target) {
          return true
        }
      }
    } catch {
      // Destination may not exist yet while git clone is still running.
    }

    await new Promise(resolve => window.setTimeout(resolve, 800))
  }

  return false
}
