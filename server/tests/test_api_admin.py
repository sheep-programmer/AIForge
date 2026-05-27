"""GET /v1/admin/discoveries + POST approve/reject 端到端测试。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from aiforge.core.models import IngestJob, PendingDiscovery


def _seed_discovery(
    session: Session,
    discovery_id: str = "disc_x",
    decision: str = "pending",
) -> None:
    """造一条 PendingDiscovery。"""
    session.add(
        PendingDiscovery(
            id=discovery_id,
            source_url=f"https://github.com/owner/{discovery_id}",
            source_repo=f"owner/{discovery_id}",
            source_stars=10,
            skill_count=2,
            sample_skill_names="[]",
            found_via="test",
            decision=decision,
            found_at=datetime.now(timezone.utc),
        )
    )
    session.commit()


def test_admin_list_discoveries_returns_list(
    api_client: TestClient, db_session: Session
) -> None:
    """GET /admin/discoveries 返回 JSON 列表。"""
    _seed_discovery(db_session, "disc_a")
    _seed_discovery(db_session, "disc_b")

    resp = api_client.get("/v1/admin/discoveries")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    ids = {item["id"] for item in body}
    assert "disc_a" in ids
    assert "disc_b" in ids


def test_admin_approve_creates_ingest_job(
    api_client: TestClient, db_session: Session
) -> None:
    """POST /admin/discoveries/{id}/approve 应返回 ingest_job_id 并入库 IngestJob。"""
    _seed_discovery(db_session, "disc_approve")

    resp = api_client.post("/v1/admin/discoveries/disc_approve/approve", json={})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["discovery_id"] == "disc_approve"
    assert body["decision"] == "approved"
    assert body["ingest_job_id"] is not None
    assert body["ingest_job_id"].startswith("job_")

    # IngestJob 行应存在
    db_session.expire_all()
    job = db_session.get(IngestJob, body["ingest_job_id"])
    assert job is not None


def test_admin_approve_already_approved_returns_409(
    api_client: TestClient, db_session: Session
) -> None:
    """重复 approve 应返回 409 invalid_state。"""
    _seed_discovery(db_session, "disc_dup", decision="approved")

    resp = api_client.post("/v1/admin/discoveries/disc_dup/approve", json={})
    assert resp.status_code == 409
    assert resp.json().get("code") == "invalid_state"


def test_admin_approve_missing_returns_404(api_client: TestClient) -> None:
    """approve 不存在的 id → 404。"""
    resp = api_client.post("/v1/admin/discoveries/nope/approve", json={})
    assert resp.status_code == 404


def test_admin_reject_marks_rejected(
    api_client: TestClient, db_session: Session
) -> None:
    """reject 成功返回 decision=rejected。"""
    _seed_discovery(db_session, "disc_rej_ok")

    resp = api_client.post(
        "/v1/admin/discoveries/disc_rej_ok/reject",
        json={"notes": "junk"},
    )
    assert resp.status_code == 200
    assert resp.json()["decision"] == "rejected"


def test_admin_requires_bearer_when_api_key_set(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """启用 api_key 后 admin 端点必须 Bearer 鉴权。"""
    monkeypatch.setenv("AIFORGE_API_KEY", "supersecret")

    from aiforge.config import get_settings

    get_settings.cache_clear()

    # 必须在 settings 更新后再起 client（让 lifespan 拿到新 settings）
    from aiforge.main import app

    with TestClient(app) as client:
        _seed_discovery(db_session, "disc_auth")

        # 无 token → 401
        resp = client.get("/v1/admin/discoveries")
        assert resp.status_code == 401

        # 错 token → 401
        resp = client.get(
            "/v1/admin/discoveries",
            headers={"Authorization": "Bearer wrong"},
        )
        assert resp.status_code == 401

        # 正确 token → 200
        resp = client.get(
            "/v1/admin/discoveries",
            headers={"Authorization": "Bearer supersecret"},
        )
        assert resp.status_code == 200

    # 清理：恢复无 api_key
    monkeypatch.delenv("AIFORGE_API_KEY", raising=False)
    get_settings.cache_clear()
