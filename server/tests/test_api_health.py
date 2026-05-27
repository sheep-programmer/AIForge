"""GET /v1/health 端到端测试。"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_returns_200(api_client: TestClient) -> None:
    """/v1/health 必须 200 且返回基本字段。"""
    resp = api_client.get("/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "status",
        "version",
        "skills_count",
        "reranker_available",
        "embedder_loaded",
        "uptime_seconds",
    ):
        assert key in body


def test_health_status_value_valid(api_client: TestClient) -> None:
    """status 必须是允许的枚举值。"""
    resp = api_client.get("/v1/health")
    assert resp.json()["status"] in {"ok", "degraded", "error"}


def test_health_skills_count_is_integer(api_client: TestClient) -> None:
    """skills_count 必须 ≥ 0 的整数。"""
    body = api_client.get("/v1/health").json()
    assert isinstance(body["skills_count"], int)
    assert body["skills_count"] >= 0


def test_health_response_includes_request_id_header(api_client: TestClient) -> None:
    """每个响应都应带 X-Request-ID 头。"""
    resp = api_client.get("/v1/health")
    assert "X-Request-ID" in resp.headers
    assert resp.headers["X-Request-ID"].startswith("req_")
