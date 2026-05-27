"""discovery.approval.approve / reject / list_pending 单元测试。"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from aiforge.core.models import IngestJob, PendingDiscovery
from aiforge.discovery.approval import (
    DiscoveryNotFoundError,
    DiscoveryStateError,
    approve,
    list_pending,
    reject,
)


def _make_discovery(
    session: Session,
    discovery_id: str = "disc_test",
    decision: str = "pending",
    source_url: str = "https://github.com/owner/repo",
) -> PendingDiscovery:
    """造一条 PendingDiscovery 并落库。"""
    row = PendingDiscovery(
        id=discovery_id,
        source_url=source_url,
        source_repo="owner/repo",
        source_stars=42,
        skill_count=3,
        sample_skill_names="[]",
        found_via="test",
        decision=decision,
        found_at=datetime.now(timezone.utc),
    )
    session.add(row)
    session.commit()
    return row


def _fake_factory(url: str, session: Session) -> str:
    """注入测试用 factory：只返回 job id，不创建真 IngestJob。"""
    return "job_test_fake"


def test_approve_pending_creates_ingest_job(db_session: Session) -> None:
    """批准 pending 条目应：状态变 approved，并创建 IngestJob 行。"""
    _make_discovery(db_session, discovery_id="disc_ok")

    def factory(url: str, session: Session) -> str:
        job = IngestJob(id="job_real", source_url=url, status="pending")
        session.add(job)
        session.flush()
        return "job_real"

    returned = approve("disc_ok", db_session, ingest_factory=factory)
    assert returned == "job_real"

    refreshed = db_session.get(PendingDiscovery, "disc_ok")
    assert refreshed is not None
    assert refreshed.decision == "approved"
    assert refreshed.reviewed_at is not None

    job = db_session.get(IngestJob, "job_real")
    assert job is not None
    assert job.source_url == "https://github.com/owner/repo"


def test_approve_already_approved_raises_state_error(db_session: Session) -> None:
    """已 approved 的条目再 approve → DiscoveryStateError。"""
    _make_discovery(db_session, discovery_id="disc_done", decision="approved")
    with pytest.raises(DiscoveryStateError):
        approve("disc_done", db_session, ingest_factory=_fake_factory)


def test_approve_rejected_raises_state_error(db_session: Session) -> None:
    """已 rejected 的条目再 approve → DiscoveryStateError。"""
    _make_discovery(db_session, discovery_id="disc_rej", decision="rejected")
    with pytest.raises(DiscoveryStateError):
        approve("disc_rej", db_session, ingest_factory=_fake_factory)


def test_approve_nonexistent_raises_not_found(db_session: Session) -> None:
    """不存在的 id → DiscoveryNotFoundError。"""
    with pytest.raises(DiscoveryNotFoundError):
        approve("disc_does_not_exist", db_session, ingest_factory=_fake_factory)


def test_reject_pending_marks_rejected(db_session: Session) -> None:
    """reject 一个 pending 条目 → decision=rejected，notes 落库。"""
    _make_discovery(db_session, discovery_id="disc_r1")
    reject("disc_r1", db_session, notes="low quality")

    refreshed = db_session.get(PendingDiscovery, "disc_r1")
    assert refreshed is not None
    assert refreshed.decision == "rejected"
    assert refreshed.notes == "low quality"


def test_reject_already_processed_raises(db_session: Session) -> None:
    """已处理的条目再 reject → DiscoveryStateError。"""
    _make_discovery(db_session, discovery_id="disc_r2", decision="approved")
    with pytest.raises(DiscoveryStateError):
        reject("disc_r2", db_session)


def test_reject_nonexistent_raises_not_found(db_session: Session) -> None:
    """reject 不存在的 id → DiscoveryNotFoundError。"""
    with pytest.raises(DiscoveryNotFoundError):
        reject("missing", db_session)


def test_list_pending_returns_only_pending(db_session: Session) -> None:
    """list_pending 仅返回 decision=pending 的条目。"""
    _make_discovery(db_session, "d_p1", decision="pending", source_url="https://github.com/a/r1")
    _make_discovery(db_session, "d_p2", decision="pending", source_url="https://github.com/a/r2")
    _make_discovery(db_session, "d_done", decision="approved", source_url="https://github.com/a/r3")

    rows = list_pending(db_session)
    ids = {r.id for r in rows}
    assert "d_p1" in ids
    assert "d_p2" in ids
    assert "d_done" not in ids


def test_approve_factory_exception_rolls_back(db_session: Session) -> None:
    """factory 抛异常时：decision 不应被改为 approved（事务回滚）。"""
    _make_discovery(db_session, discovery_id="disc_boom")

    def boom(url: str, session: Session) -> str:
        raise RuntimeError("ingest start failed")

    with pytest.raises(RuntimeError):
        approve("disc_boom", db_session, ingest_factory=boom)

    db_session.expire_all()
    refreshed = db_session.get(PendingDiscovery, "disc_boom")
    assert refreshed is not None
    assert refreshed.decision == "pending"
