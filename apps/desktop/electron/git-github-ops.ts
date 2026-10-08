// GitHub side-bar ops for the IDE activity bar. Prefer the local `gh` CLI so
// end users never need a Hermes OAuth app — same model as VS Code's GitHub
// Pull Requests extension, without its Extension Host APIs.

import { execFile } from 'node:child_process'
import path from 'node:path'

import { resolveRequestedPathForIpc } from './hardening'

const GITHUB_LIST_LIMIT = '30'
const GH_TIMEOUT_MS = 45_000
const GH_MUTATION_TIMEOUT_MS = 120_000

function ghEnv(ghBin) {
  const dir = ghBin ? path.dirname(ghBin) : ''
  const extra = dir && !process.env.PATH?.toLowerCase().includes(dir.toLowerCase()) ? [dir] : []

  return { ...process.env, PATH: [...extra, process.env.PATH].filter(Boolean).join(path.delimiter) }
}

function runGh(args, cwd, ghBin, timeoutMs = GH_TIMEOUT_MS) {
  return new Promise(resolve => {
    execFile(
      ghBin || 'gh',
      args,
      { cwd, env: ghEnv(ghBin), windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) =>
        resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(err?.stderr ?? stderr ?? '') })
    )
  })
}

function githubLogin(node) {
  if (!node || typeof node !== 'object') {
    return ''
  }

  return String(node.login || node.name || node.id || '')
}

function githubLogins(nodes) {
  return Array.isArray(nodes) ? nodes.map(githubLogin).filter(Boolean) : []
}

function githubRows(raw) {
  if (!raw.ok) {
    return []
  }

  try {
    const parsed = JSON.parse(raw.stdout)

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function checkRollup(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { state: 'none', detail: '' }
  }

  const states = raw.map(item => String(item?.state || item?.conclusion || '').toUpperCase())

  if (states.some(state => state === 'FAILURE' || state === 'ERROR' || state === 'CANCELLED' || state === 'TIMED_OUT')) {
    return { state: 'fail', detail: `${raw.length} checks` }
  }

  if (states.some(state => state === 'PENDING' || state === 'QUEUED' || state === 'IN_PROGRESS' || state === 'EXPECTED')) {
    return { state: 'pending', detail: `${raw.length} checks` }
  }

  if (states.every(state => state === 'SUCCESS' || state === 'NEUTRAL' || state === 'SKIPPED')) {
    return { state: 'pass', detail: `${raw.length} checks` }
  }

  return { state: 'pending', detail: `${raw.length} checks` }
}

/** Open PRs and issues for the IDE GitHub side bar. */
export async function githubSidebar(repoPath, ghBin) {
  let cwd

  try {
    cwd = resolveRequestedPathForIpc(repoPath, { purpose: 'GitHub sidebar' })
  } catch {
    return { prs: [], issues: [] }
  }

  const [prRaw, issueRaw] = await Promise.all([
    runGh(
      [
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        GITHUB_LIST_LIMIT,
        '--json',
        'number,title,url,isDraft,author,reviewRequests,headRefName,statusCheckRollup'
      ],
      cwd,
      ghBin
    ),
    runGh(
      ['issue', 'list', '--state', 'open', '--limit', GITHUB_LIST_LIMIT, '--json', 'number,title,url,author,assignees'],
      cwd,
      ghBin
    )
  ])

  return {
    prs: githubRows(prRaw).map(pr => {
      const checks = checkRollup(pr.statusCheckRollup)

      return {
        number: Number(pr.number) || 0,
        title: String(pr.title || ''),
        url: String(pr.url || ''),
        draft: Boolean(pr.isDraft),
        author: githubLogin(pr.author),
        branch: String(pr.headRefName || ''),
        reviewers: githubLogins(pr.reviewRequests),
        checkState: checks.state,
        checkDetail: checks.detail
      }
    }),
    issues: githubRows(issueRaw).map(issue => ({
      number: Number(issue.number) || 0,
      title: String(issue.title || ''),
      url: String(issue.url || ''),
      author: githubLogin(issue.author),
      assignees: githubLogins(issue.assignees)
    }))
  }
}

const PR_FILE_MARK = { ADDED: 'A', COPIED: 'R', DELETED: 'D', RENAMED: 'R' }

/** Files touched by one open PR, for the expanded row. */
export async function githubPrFiles(repoPath, number, ghBin) {
  const pr = Number(number)

  if (!Number.isInteger(pr) || pr <= 0) {
    return { files: [] }
  }

  let cwd

  try {
    cwd = resolveRequestedPathForIpc(repoPath, { purpose: 'GitHub PR files' })
  } catch {
    return { files: [] }
  }

  const raw = await runGh(['pr', 'view', String(pr), '--json', 'files'], cwd, ghBin)

  if (!raw.ok) {
    return { files: [] }
  }

  try {
    const files = JSON.parse(raw.stdout)?.files

    if (!Array.isArray(files)) {
      return { files: [] }
    }

    return {
      files: files.map(file => ({
        path: String(file.path || ''),
        mark: PR_FILE_MARK[file.changeType] || 'M'
      }))
    }
  } catch {
    return { files: [] }
  }
}

/** Checkout a PR into a local branch (`gh pr checkout`). */
export async function githubCheckoutPr(repoPath, number, ghBin) {
  const pr = Number(number)

  if (!Number.isInteger(pr) || pr <= 0) {
    return { ok: false, message: 'Invalid pull request number.' }
  }

  let cwd

  try {
    cwd = resolveRequestedPathForIpc(repoPath, { purpose: 'GitHub PR checkout' })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  const raw = await runGh(['pr', 'checkout', String(pr)], cwd, ghBin, GH_MUTATION_TIMEOUT_MS)

  return {
    ok: raw.ok,
    message: (raw.ok ? raw.stdout : raw.stderr || raw.stdout).trim() || (raw.ok ? `Checked out PR #${pr}.` : `Failed to checkout PR #${pr}.`)
  }
}

/** Start work on an issue: create/checkout a branch (`gh issue develop --checkout`). */
export async function githubStartIssue(repoPath, number, ghBin) {
  const issue = Number(number)

  if (!Number.isInteger(issue) || issue <= 0) {
    return { ok: false, message: 'Invalid issue number.' }
  }

  let cwd

  try {
    cwd = resolveRequestedPathForIpc(repoPath, { purpose: 'GitHub issue branch' })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  const raw = await runGh(['issue', 'develop', String(issue), '--checkout'], cwd, ghBin, GH_MUTATION_TIMEOUT_MS)

  return {
    ok: raw.ok,
    message:
      (raw.ok ? raw.stdout || raw.stderr : raw.stderr || raw.stdout).trim() ||
      (raw.ok
        ? `Started work on issue #${issue}.`
        : `Could not start work on issue #${issue}. Update GitHub CLI (gh) and try again.`)
  }
}

/** Per-check details for one PR (`gh pr checks --json`). */
export async function githubPrChecks(repoPath, number, ghBin) {
  const pr = Number(number)

  if (!Number.isInteger(pr) || pr <= 0) {
    return { checks: [] }
  }

  let cwd

  try {
    cwd = resolveRequestedPathForIpc(repoPath, { purpose: 'GitHub PR checks' })
  } catch {
    return { checks: [] }
  }

  const raw = await runGh(['pr', 'checks', String(pr), '--json', 'name,state,bucket,link'], cwd, ghBin)

  if (!raw.ok) {
    return { checks: [] }
  }

  try {
    const parsed = JSON.parse(raw.stdout)

    if (!Array.isArray(parsed)) {
      return { checks: [] }
    }

    return {
      checks: parsed.map(item => ({
        name: String(item.name || ''),
        state: String(item.state || item.bucket || ''),
        link: String(item.link || '')
      }))
    }
  } catch {
    return { checks: [] }
  }
}
