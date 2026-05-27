"""Ingestion 主管线：clone → parse → embed → upsert。

状态机：pending → fetching → parsing → embedding → done / error。

Phase 2 起一个 job 可能同时产出 skill / mcp / plugin 三种 artifact；
统一在 ``_embed_and_upsert`` 里走同一条 embed → upsert 路径。
"""

from __future__ import annotations

import asyncio
import hashlib
import tempfile
import traceback
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import structlog
import ulid
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from aiforge.config import Settings, get_settings
from aiforge.core.db import get_session_maker, pack_embedding, upsert_embedding
from aiforge.core.models import IngestJob, Skill
from aiforge.ingestion.github import (
    clone_shallow,
    fetch_repo_stars,
    normalize_repo_url,
    parse_owner_repo,
)
from aiforge.ingestion.mcp_adapter import parse_mcp
from aiforge.ingestion.plugin_adapter import parse_plugin
from aiforge.ingestion.splitter import find_mcps, find_plugins, find_skills

logger = structlog.get_logger(__name__)

# 持有后台 task 强引用，防止事件循环 GC 掉未完成的 ingest job
_BACKGROUND_TASKS: set[asyncio.Task[None]] = set()


def _make_skill_id(source_url: str, source_path: str) -> str:
    """SHA256(source_url + source_path) 前 16 字符作为稳定主键。"""
    digest = hashlib.sha256(f"{source_url}\n{source_path}".encode()).hexdigest()
    return digest[:16]


def _make_job_id() -> str:
    return f"job_{ulid.new().str}"


@dataclass(frozen=True, slots=True)
class _ArtifactRecord:
    """供 ``_embed_and_upsert`` 消费的统一中间结构。

    把 skill / mcp / plugin 三种解析结果归一成同一形状，避免在主循环里
    再走类型分支；mcp_config / plugin_manifest 不适用时留 None。
    """

    artifact_type: str
    source_path: str
    name: str
    description: str
    body: str
    body_tokens: int
    mcp_config: dict[str, Any] | None = None
    plugin_manifest: dict[str, Any] | None = None


class IngestPipeline:
    """串联各阶段：clone、parse、embed、写库。

    依赖通过构造函数注入：session_maker、settings；embedder 在 ``run_job`` 内
    惰性获取，避免在不需要 ingest 时也加载模型。
    """

    def __init__(
        self,
        session_maker: sessionmaker[Session] | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._session_maker = session_maker or get_session_maker(self._settings)

    # ---------- 公共入口 ----------

    async def run_job(self, job_id: str) -> None:
        """异步驱动一个已创建的 job 走完状态机。失败写 error。"""
        log = logger.bind(job_id=job_id)
        log.info("ingest.job_start")
        try:
            await asyncio.to_thread(self._run_job_sync, job_id, log)
        except Exception as exc:
            # 兜底：任何意外异常都落到 error 状态
            log.exception("ingest.job_unhandled", error=str(exc))
            await asyncio.to_thread(self._mark_error, job_id, traceback.format_exc())

    # ---------- 同步主流程（在线程池里跑） ----------

    def _run_job_sync(self, job_id: str, log: structlog.stdlib.BoundLogger) -> None:
        job_snapshot = self._load_job(job_id)
        if job_snapshot is None:
            log.error("ingest.job_missing")
            return

        source_url = normalize_repo_url(job_snapshot.source_url)
        branch = job_snapshot.branch
        owner, repo = parse_owner_repo(source_url)
        source_repo = f"{owner}/{repo}"

        token = self._settings.github_token

        # ---- fetching ----
        self._set_status(job_id, "fetching")
        with tempfile.TemporaryDirectory(prefix="aiforge-ingest-") as tmpdir:
            repo_dir = Path(tmpdir) / "repo"
            try:
                clone_shallow(source_url, branch, repo_dir, token=token)
            except Exception as exc:
                log.error("ingest.clone_failed", error=str(exc))
                self._mark_error(job_id, f"clone failed: {exc}")
                return

            stars = fetch_repo_stars(source_url, token=token)
            log.info("ingest.repo_stars", stars=stars)

            # ---- parsing ----
            self._set_status(job_id, "parsing")
            records = self._collect_records(repo_dir, source_url, log)
            if not records:
                log.warning("ingest.no_artifacts_found")
                self._mark_done(job_id, added=0, updated=0)
                return

            # ---- embedding ----
            self._set_status(job_id, "embedding")
            try:
                added, updated = self._embed_and_upsert(
                    records=records,
                    source_url=source_url,
                    source_repo=source_repo,
                    source_stars=stars,
                    auto_approve=job_snapshot.auto_approve,
                    log=log,
                )
            except Exception as exc:
                log.exception("ingest.embed_failed", error=str(exc))
                self._mark_error(job_id, f"embed/upsert failed: {exc}")
                return

            self._mark_done(job_id, added=added, updated=updated)
            log.info("ingest.job_done", added=added, updated=updated)

    # ---------- 子步骤 ----------

    def _collect_records(
        self,
        repo_dir: Path,
        source_url: str,
        log: structlog.stdlib.BoundLogger,
    ) -> list[_ArtifactRecord]:
        """聚合 skill / mcp / plugin 三类 artifact 为统一记录列表。

        相同 ``source_path`` 去重：plugin/mcp 探测可能与 SKILL.md 互不冲突，
        但保留一道防御，避免主键重复。
        """
        records: list[_ArtifactRecord] = []

        # plugin
        for detected in find_plugins(repo_dir):
            parsed = parse_plugin(detected, repo_dir, source_url=source_url)
            if parsed is None:
                continue
            records.append(
                _ArtifactRecord(
                    artifact_type="plugin",
                    source_path=detected.source_path,
                    name=parsed.name,
                    description=parsed.description,
                    body=parsed.body,
                    body_tokens=parsed.body_tokens,
                    plugin_manifest=parsed.plugin_manifest,
                )
            )

        # mcp
        for detected in find_mcps(repo_dir):
            parsed_mcp = parse_mcp(detected, repo_dir)
            if parsed_mcp is None:
                continue
            records.append(
                _ArtifactRecord(
                    artifact_type="mcp",
                    source_path=detected.source_path,
                    name=parsed_mcp.name,
                    description=parsed_mcp.description,
                    body=parsed_mcp.body,
                    body_tokens=parsed_mcp.body_tokens,
                    mcp_config=parsed_mcp.mcp_config,
                )
            )

        # skill（保持老路径不变）
        for rel_path, skill in find_skills(repo_dir):
            records.append(
                _ArtifactRecord(
                    artifact_type="skill",
                    source_path=rel_path.as_posix(),
                    name=skill.name,
                    description=skill.description,
                    body=skill.body,
                    body_tokens=skill.body_tokens,
                )
            )

        # 同 source_path 去重，第一份优先（plugin > mcp > skill）
        seen: set[str] = set()
        unique: list[_ArtifactRecord] = []
        for rec in records:
            if rec.source_path in seen:
                log.warning(
                    "ingest.duplicate_source_path",
                    source_path=rec.source_path,
                    artifact_type=rec.artifact_type,
                )
                continue
            seen.add(rec.source_path)
            unique.append(rec)

        log.info(
            "ingest.records_collected",
            total=len(unique),
            skills=sum(1 for r in unique if r.artifact_type == "skill"),
            mcps=sum(1 for r in unique if r.artifact_type == "mcp"),
            plugins=sum(1 for r in unique if r.artifact_type == "plugin"),
        )
        return unique

    def _embed_and_upsert(
        self,
        records: list[_ArtifactRecord],
        source_url: str,
        source_repo: str,
        source_stars: int,
        auto_approve: bool,
        log: structlog.stdlib.BoundLogger,
    ) -> tuple[int, int]:
        """批量 embed 后逐条 upsert。返回 (added, updated)，含所有 artifact 类型。"""
        # 在真正需要时再加载 embedder（首次加载 ~3s）
        from aiforge.recommender.embedder import get_embedder

        embedder = get_embedder(self._settings)

        # 用 "name\n\ndescription" 作为编码文本：name + description 信息密度最高
        # 对 skill / mcp / plugin 一致处理，便于跨类型检索
        texts = [f"{r.name}\n\n{r.description}" for r in records]
        vectors = embedder.embed_batch(texts)
        log.info(
            "ingest.embed_batch",
            count=len(texts),
            dim=int(vectors.shape[1]),
        )

        added = 0
        updated = 0

        with self._session_maker() as session:
            for rec, vec in zip(records, vectors, strict=True):
                skill_id = _make_skill_id(source_url, rec.source_path)

                existing = session.execute(
                    select(Skill).where(Skill.id == skill_id)
                ).scalar_one_or_none()

                now = datetime.utcnow()
                packed = pack_embedding(vec)
                if existing is None:
                    record = Skill(
                        id=skill_id,
                        name=rec.name,
                        description=rec.description,
                        body=rec.body,
                        body_tokens=rec.body_tokens,
                        source_url=source_url,
                        source_path=rec.source_path,
                        source_repo=source_repo,
                        source_stars=source_stars,
                        embedding=packed,
                        is_approved=auto_approve,
                        is_active=True,
                        artifact_type=rec.artifact_type,
                        mcp_config=rec.mcp_config,
                        plugin_manifest=rec.plugin_manifest,
                    )
                    session.add(record)
                    session.flush()  # 拿到 rowid（SQLAlchemy 用主键，但 vss 表对齐 sqlite rowid）
                    rowid = self._get_rowid(session, skill_id)
                    upsert_embedding(session, rowid, vec)
                    added += 1
                    log.info(
                        "ingest.artifact_added",
                        id=skill_id,
                        artifact_type=rec.artifact_type,
                        name=rec.name,
                    )
                else:
                    existing.name = rec.name
                    existing.description = rec.description
                    existing.body = rec.body
                    existing.body_tokens = rec.body_tokens
                    existing.source_repo = source_repo
                    existing.source_stars = source_stars
                    existing.embedding = packed
                    existing.updated_at = now
                    # 类型/JSON 字段允许从老 skill 升级，或在 manifest 变更时刷新
                    existing.artifact_type = rec.artifact_type
                    existing.mcp_config = rec.mcp_config
                    existing.plugin_manifest = rec.plugin_manifest
                    session.flush()
                    rowid = self._get_rowid(session, skill_id)
                    upsert_embedding(session, rowid, vec)
                    updated += 1
                    log.info(
                        "ingest.artifact_updated",
                        id=skill_id,
                        artifact_type=rec.artifact_type,
                        name=rec.name,
                    )

            session.commit()

        return added, updated

    @staticmethod
    def _get_rowid(session: Session, skill_id: str) -> int:
        """skills 表是字符串主键，vss 表对齐 sqlite 隐式 rowid，单独查一次。"""
        from sqlalchemy import text

        row = session.execute(
            text("SELECT rowid FROM skills WHERE id = :id"),
            {"id": skill_id},
        ).first()
        if row is None:
            raise RuntimeError(f"skill row not found right after insert: {skill_id}")
        return int(row[0])

    # ---------- 状态变更 ----------

    def _load_job(self, job_id: str) -> IngestJob | None:
        with self._session_maker() as session:
            return session.execute(
                select(IngestJob).where(IngestJob.id == job_id)
            ).scalar_one_or_none()

    def _set_status(self, job_id: str, status: str) -> None:
        with self._session_maker() as session:
            job = session.get(IngestJob, job_id)
            if job is None:
                return
            job.status = status
            session.commit()

    def _mark_done(self, job_id: str, added: int, updated: int) -> None:
        with self._session_maker() as session:
            job = session.get(IngestJob, job_id)
            if job is None:
                return
            job.status = "done"
            job.skills_added = added
            job.skills_updated = updated
            job.finished_at = datetime.utcnow()
            session.commit()

    def _mark_error(self, job_id: str, error: str) -> None:
        # 超长 error 截断，避免撑爆 Text 列
        truncated = error if len(error) <= 4000 else error[:3996] + "..."
        with self._session_maker() as session:
            job = session.get(IngestJob, job_id)
            if job is None:
                return
            job.status = "error"
            job.error = truncated
            job.finished_at = datetime.utcnow()
            session.commit()


# ---------- 顶层入口 ----------


async def ingest(
    github_url: str,
    branch: str,
    auto_approve: bool,
    session: Session,
    *,
    settings: Settings | None = None,
) -> IngestJob:
    """同步创建 IngestJob，异步触发 ``run_job``，返回 job 记录。

    参数 ``session`` 用于创建 job 行；后续异步阶段会自己开新 session，
    避免跨任务共享 session。
    """
    s = settings or get_settings()
    normalized = normalize_repo_url(github_url)

    job_id = _make_job_id()
    job = IngestJob(
        id=job_id,
        source_url=normalized,
        branch=branch,
        auto_approve=auto_approve,
        status="pending",
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    logger.info(
        "ingest.job_created",
        job_id=job_id,
        url=normalized,
        branch=branch,
        auto_approve=auto_approve,
    )

    pipeline = IngestPipeline(settings=s)
    # 持强引用，避免事件循环 GC 掉未完成的 task（CPython 文档明确建议）
    task = asyncio.create_task(pipeline.run_job(job_id))
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return job
