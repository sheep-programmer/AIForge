"""GET/PATCH/DELETE /v1/skills 端到端测试。"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests._utils import make_skill, seed_skill


def _seed_some(session: Session) -> list[str]:
    """造 3 条 skill。"""
    ids: list[str] = []
    skills = [
        make_skill("id_sec", name="security-review", description="审计代码安全风险"),
        make_skill("id_pr", name="pr-review", description="代码审查"),
        make_skill("id_vid", name="video-edit", description="视频剪辑"),
    ]
    for s in skills:
        seed_skill(session, s)
        ids.append(s.id)
    return ids


def test_list_skills_paginated(api_client: TestClient, db_session: Session) -> None:
    """列表带分页字段。"""
    _seed_some(db_session)

    resp = api_client.get("/v1/skills?limit=2&offset=0")
    assert resp.status_code == 200
    body = resp.json()
    assert body["limit"] == 2
    assert body["offset"] == 0
    assert body["total"] >= 3
    assert len(body["items"]) == 2


def test_list_skills_query_filter(api_client: TestClient, db_session: Session) -> None:
    """?q=security 应只返回名字或描述含 security 的条目。"""
    _seed_some(db_session)

    resp = api_client.get("/v1/skills?q=security")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(
        "security" in item["name"].lower() or "security" in item["description"].lower()
        for item in items
    )
    assert any(item["id"] == "id_sec" for item in items)


def test_patch_skill_toggles_is_active(api_client: TestClient, db_session: Session) -> None:
    """PATCH is_active 应改写并返回 detail。"""
    _seed_some(db_session)

    resp = api_client.patch("/v1/skills/id_sec", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    resp2 = api_client.get("/v1/skills/id_sec")
    assert resp2.json()["is_active"] is False


def test_delete_skill_returns_204(api_client: TestClient, db_session: Session) -> None:
    """DELETE 返回 204；之后查询 404。"""
    _seed_some(db_session)

    resp = api_client.delete("/v1/skills/id_vid")
    assert resp.status_code == 204

    resp2 = api_client.get("/v1/skills/id_vid")
    assert resp2.status_code == 404


def test_get_nonexistent_skill_returns_404(api_client: TestClient) -> None:
    """不存在的 id → 404。"""
    resp = api_client.get("/v1/skills/never_exists")
    assert resp.status_code == 404
    body = resp.json()
    assert body.get("code") == "not_found"


def test_patch_nonexistent_skill_returns_404(api_client: TestClient) -> None:
    """PATCH 不存在的 id → 404。"""
    resp = api_client.patch("/v1/skills/never_exists", json={"is_active": True})
    assert resp.status_code == 404
