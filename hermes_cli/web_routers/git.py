"""Git dashboard routes — the remote half of the desktop coding rail + review pane.

The desktop runs these as Electron-local git; over a remote gateway that's the wrong
filesystem, so they are mirrored here with the same auth gate + path hardening as
/api/fs. Logic lives in ``hermes_cli.web_git``; these are thin executor-offloaded
wrappers (git/gh can block).
"""

import asyncio
import os
import re
import shutil
import time
from typing import Optional

from fastapi import APIRouter, HTTPException

from hermes_cli import web_git as _web_git
from hermes_cli._subprocess_compat import bounded_probe_run
from hermes_cli.web_deps import late
from hermes_cli.web_server_files import _fs_path
from hermes_cli.web_models import (
    GitBranchCheckoutBody,
    GitBranchSwitchBody,
    GitCommitBody,
    GitFileBody,
    GitPathBody,
    GitPrListBody,
    GitWorktreeAddBody,
    GitWorktreeRemoveBody,
)

router = APIRouter()

# Late-bound so a test's monkeypatch on the owning module wins at call time.


async def _git_op(fn, *args):
    """Run a (blocking) git op off the event loop; map a failed mutation to 400."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, fn, *args)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "git operation failed")


def _git_path(path: str) -> str:
    return str(_fs_path(path))


@router.get("/api/git/status")
async def git_status_route(path: str):
    return await _git_op(_web_git.repo_status, _git_path(path))


@router.get("/api/git/log")
async def git_log_route(path: str):
    return await _git_op(_web_git.repo_log, _git_path(path))


@router.get("/api/git/file-history")
async def git_file_history_route(path: str, file: str):
    return await _git_op(_web_git.file_history, _git_path(path), file)


@router.get("/api/git/file-commit-diff")
async def git_file_commit_diff_route(path: str, file: str, rev: str):
    return {"diff": await _git_op(_web_git.file_commit_diff, _git_path(path), file, rev)}


@router.get("/api/git/file-conflict-sides")
async def git_file_conflict_sides_route(path: str, file: str):
    return await _git_op(_web_git.file_conflict_sides, _git_path(path), file)


# Cached `gh auth status` for the desktop composer's GitHub suggestion pill. GitHub
# deliberately has NO MCP catalog entry (hosted MCP needs a per-host OAuth app; the
# gh-CLI skills are the better integration), so the pill offers `/github-auth` —
# only to users who aren't already authenticated.
_GH_AUTH_TTL_S = 300.0
_gh_auth_cache: Optional[tuple] = None  # (monotonic_ts, payload)
_gh_auth_probe_task: Optional[asyncio.Task] = None
_gh_auth_probe_started = 0.0  # monotonic start of _gh_auth_probe_task


def _gh_binary() -> Optional[str]:
    """Find ``gh`` even when this process started before GitHub CLI was installed.

    ``shutil.which`` only sees the PATH frozen at launch. A winget/MSI install
    updates the registry PATH and drops ``gh.exe`` under Program Files, which
    the already-running serve process will not notice.
    """
    found = shutil.which("gh")
    if found:
        return found
    if os.name != "nt":
        return None
    folders: list[str] = []
    try:
        import winreg

        for hive, key_path in (
            (winreg.HKEY_CURRENT_USER, "Environment"),
            (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
        ):
            with winreg.OpenKey(hive, key_path) as key:
                value, _ = winreg.QueryValueEx(key, "Path")
            folders.extend(part.strip().strip('"') for part in str(value).split(";") if part.strip())
    except OSError:
        pass
    candidates = [os.path.join(os.path.expandvars(folder), "gh.exe") for folder in folders]
    program_files = os.environ.get("ProgramFiles") or r"C:\Program Files"
    local = os.environ.get("LOCALAPPDATA") or ""
    candidates.extend(
        [
            os.path.join(program_files, "GitHub CLI", "gh.exe"),
            os.path.join(local, "GitHub CLI", "gh.exe") if local else "",
            os.path.join(local, "Programs", "GitHub CLI", "gh.exe") if local else "",
        ]
    )
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


def _probe_gh_auth() -> dict:
    gh = _gh_binary()
    if not gh:
        return {"available": False, "authenticated": False, "account": ""}
    try:
        # Exits 0 when at least one host is logged in; DEVNULL stdin guards against any prompt.
        proc = bounded_probe_run([gh, "auth", "status"], timeout=10)
        text = f"{getattr(proc, 'stdout', '')}\n{getattr(proc, 'stderr', '')}" if proc else ""
        account = ""
        matched = re.search(r"account\s+(\S+)", text)
        if matched:
            account = matched.group(1).strip("()")
        return {
            "available": True,
            "authenticated": bool(proc and proc.returncode == 0),
            "account": account,
        }
    except Exception:
        return {"available": True, "authenticated": False, "account": ""}


def _clear_gh_auth_probe_task(completed_task: asyncio.Task) -> None:
    """Release a completed shared probe even if all requesters disconnected."""
    global _gh_auth_probe_task
    if _gh_auth_probe_task is completed_task:
        _gh_auth_probe_task = None


@router.get("/api/git/gh-auth")
async def gh_auth_status_route(refresh: bool = False):
    """``{"available", "authenticated"}`` for the `gh` CLI; cached 5 min
    (``refresh=true`` bypasses so the pill withdraws right after a login)."""
    global _gh_auth_cache, _gh_auth_probe_task, _gh_auth_probe_started
    asked = time.monotonic()
    if not refresh and _gh_auth_cache and asked - _gh_auth_cache[0] < _GH_AUTH_TTL_S:
        return _gh_auth_cache[1]
    while True:
        if _gh_auth_probe_task is None or _gh_auth_probe_task.done():
            _gh_auth_probe_task = asyncio.create_task(asyncio.to_thread(_probe_gh_auth))
            _gh_auth_probe_started = time.monotonic()
            _gh_auth_probe_task.add_done_callback(_clear_gh_auth_probe_task)
        probe_task, started = _gh_auth_probe_task, _gh_auth_probe_started
        # Shield the shared probe: disconnecting one requester must not cancel the
        # probe that other refreshes/cache misses are awaiting.
        payload = await asyncio.shield(probe_task)
        # A refresh must not accept a probe that started before it was asked for (it may predate
        # `gh auth login`, and its answer would then be cached for the full TTL): wait that one out,
        # then start or join the next. Still only one `gh` runs at a time.
        if not refresh or started >= asked:
            break
    _gh_auth_cache = (time.monotonic(), payload)
    return payload


@router.get("/api/git/worktrees")
async def git_worktrees_route(path: str):
    return {"worktrees": await _git_op(_web_git.worktree_list, _git_path(path))}


@router.get("/api/git/branches")
async def git_branches_route(path: str):
    return {"branches": await _git_op(_web_git.branch_list, _git_path(path))}


@router.get("/api/git/base-branches")
async def git_base_branches_route(path: str):
    return {"branches": await _git_op(_web_git.base_branch_list, _git_path(path))}


@router.get("/api/git/review/list")
async def git_review_list_route(path: str, scope: str = "uncommitted", base: Optional[str] = None):
    return await _git_op(_web_git.review_list, _git_path(path), scope, base)


@router.get("/api/git/review/diff")
async def git_review_diff_route(
    path: str, file: str, scope: str = "uncommitted", base: Optional[str] = None, staged: bool = False
):
    return {"diff": await _git_op(_web_git.review_diff, _git_path(path), file, scope, base, staged)}


@router.get("/api/git/file-diff")
async def git_file_diff_route(path: str, file: str):
    return {"diff": await _git_op(_web_git.file_diff_vs_head, _git_path(path), file)}


@router.get("/api/git/review/commit-context")
async def git_commit_context_route(path: str):
    return await _git_op(_web_git.review_commit_context, _git_path(path))


@router.get("/api/git/review/rev-parse")
async def git_rev_parse_route(path: str, ref: Optional[str] = None):
    return {"sha": await _git_op(_web_git.review_rev_parse, _git_path(path), ref)}


@router.get("/api/git/review/ship-info")
async def git_ship_info_route(path: str):
    return await _git_op(_web_git.review_ship_info, _git_path(path))


@router.get("/api/git/github/sidebar")
async def git_github_sidebar_route(path: str):
    return await _git_op(_web_git.github_sidebar, _git_path(path))


@router.get("/api/git/github/pr-files")
async def git_github_pr_files_route(path: str, number: int):
    return await _git_op(_web_git.github_pr_files, _git_path(path), number)


@router.post("/api/git/review/pr-list")
async def git_pr_list_route(body: GitPrListBody):
    return await _git_op(_web_git.review_pr_list, _git_path(body.path), body.branches, body.numbers)


@router.post("/api/git/review/stage")
async def git_stage_route(body: GitFileBody):
    return await _git_op(_web_git.review_stage, _git_path(body.path), body.file)


@router.post("/api/git/review/unstage")
async def git_unstage_route(body: GitFileBody):
    return await _git_op(_web_git.review_unstage, _git_path(body.path), body.file)


@router.post("/api/git/review/revert")
async def git_revert_route(body: GitFileBody):
    return await _git_op(_web_git.review_revert, _git_path(body.path), body.file)


@router.post("/api/git/review/commit")
async def git_commit_route(body: GitCommitBody):
    return await _git_op(_web_git.review_commit, _git_path(body.path), body.message, body.push)


@router.post("/api/git/review/push")
async def git_push_route(body: GitPathBody):
    return await _git_op(_web_git.review_push, _git_path(body.path))


@router.post("/api/git/review/create-pr")
async def git_create_pr_route(body: GitPathBody):
    return await _git_op(_web_git.review_create_pr, _git_path(body.path))


@router.post("/api/git/worktree/add")
async def git_worktree_add_route(body: GitWorktreeAddBody):
    options = {
        key: value
        for key, value in body.model_dump(include={"name", "branch", "base", "existingBranch"}).items()
        if value
    }
    return await _git_op(_web_git.worktree_add, _git_path(body.path), options)


@router.post("/api/git/worktree/remove")
async def git_worktree_remove_route(body: GitWorktreeRemoveBody):
    return await _git_op(
        _web_git.worktree_remove, _git_path(body.path), _git_path(body.worktreePath), body.force
    )


@router.post("/api/git/branch/switch")
async def git_branch_switch_route(body: GitBranchSwitchBody):
    return await _git_op(_web_git.branch_switch, _git_path(body.path), body.branch)


@router.post("/api/git/branch/checkout")
async def git_branch_checkout_route(body: GitBranchCheckoutBody):
    return await _git_op(
        _web_git.branch_checkout, _git_path(body.path), body.mode, body.name, body.from_ref
    )
