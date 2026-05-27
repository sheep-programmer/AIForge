"""GitHub 仓库抓取：shallow clone + REST API。"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import httpx
import structlog

logger = structlog.get_logger(__name__)


# 形如 "https://github.com/owner/repo" 或 "https://github.com/owner/repo.git"
_GITHUB_PATH_RE = re.compile(r"^/([^/]+)/([^/]+?)(?:\.git)?/?$")


class GitHubURLError(ValueError):
    """github_url 不符合 https://github.com/owner/repo 形式。"""


def parse_owner_repo(github_url: str) -> tuple[str, str]:
    """从 URL 拿到 (owner, repo)。非 github.com 域名也允许，但 path 必须是 owner/repo。"""
    parsed = urlparse(github_url)
    if not parsed.scheme or not parsed.netloc:
        raise GitHubURLError(f"invalid github url: {github_url!r}")

    match = _GITHUB_PATH_RE.match(parsed.path)
    if not match:
        raise GitHubURLError(f"cannot extract owner/repo from: {github_url!r}")
    return match.group(1), match.group(2)


def normalize_repo_url(github_url: str) -> str:
    """归一化为 https://github.com/owner/repo（去 .git 后缀和尾斜杠）。"""
    owner, repo = parse_owner_repo(github_url)
    parsed = urlparse(github_url)
    netloc = parsed.netloc
    return f"{parsed.scheme}://{netloc}/{owner}/{repo}"


def _build_clone_url(github_url: str, token: str | None) -> str:
    """把 token 注入 HTTPS clone URL（仅用于 git clone，不打日志）。"""
    parsed = urlparse(github_url)
    if not token:
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    # GitHub 接受 https://<token>@host/path 形式
    return f"{parsed.scheme}://x-access-token:{token}@{parsed.netloc}{parsed.path}"


def clone_shallow(
    github_url: str,
    branch: str,
    dest_dir: Path,
    token: str | None = None,
) -> Path:
    """shallow clone 到 dest_dir，返回 clone 落地的目录路径。

    若 dest_dir 已存在内容，先清空。失败抛 RuntimeError，错误信息中不包含 token。
    """
    if shutil.which("git") is None:
        raise RuntimeError("git executable not found on PATH")

    dest_dir = Path(dest_dir)
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.parent.mkdir(parents=True, exist_ok=True)

    clone_url = _build_clone_url(github_url, token)
    cmd = [
        "git",
        "clone",
        "--depth=1",
        "--single-branch",
        "--branch",
        branch,
        clone_url,
        str(dest_dir),
    ]
    # 日志里只暴露归一化后的 URL，绝不打 token
    safe_url = normalize_repo_url(github_url)
    logger.info("github.clone_start", url=safe_url, branch=branch, dest=str(dest_dir))

    try:
        result = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"git clone timed out after {exc.timeout}s") from exc

    if result.returncode != 0:
        # stderr 可能回显带 token 的 URL，做一次净化
        stderr = result.stderr or ""
        if token:
            stderr = stderr.replace(token, "***")
        raise RuntimeError(f"git clone failed (exit={result.returncode}): {stderr.strip()}")

    logger.info("github.clone_done", url=safe_url, branch=branch)
    return dest_dir


def fetch_repo_stars(github_url: str, token: str | None = None) -> int:
    """调用 GitHub REST API 取 stars。失败时返回 0 并记日志（不阻塞 ingest）。"""
    try:
        owner, repo = parse_owner_repo(github_url)
    except GitHubURLError:
        return 0

    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    try:
        resp = httpx.get(api_url, headers=headers, timeout=10.0)
    except httpx.HTTPError as exc:
        logger.warning("github.stars_http_error", repo=f"{owner}/{repo}", error=str(exc))
        return 0

    if resp.status_code != 200:
        logger.warning(
            "github.stars_non_200",
            repo=f"{owner}/{repo}",
            status=resp.status_code,
        )
        return 0

    payload = resp.json()
    stars = payload.get("stargazers_count", 0)
    if not isinstance(stars, int):
        return 0
    return stars
