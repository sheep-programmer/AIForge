"""recommender.reranker.rerank 单元测试，重点验证 fallback 行为。"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from aiforge.recommender import reranker as reranker_mod
from aiforge.recommender.reranker import rerank

from tests._utils import make_skill


class _FakeSettings:
    """最小化的 Settings 替代品，只暴露 reranker 关心的字段。"""

    def __init__(
        self,
        reranker: str = "none",
        reranker_model: str = "qwen2.5:1.5b",
        ollama_host: str = "http://localhost:11434",
        anthropic_api_key: str | None = None,
    ) -> None:
        self.reranker = reranker
        self.reranker_model = reranker_model
        self.ollama_host = ollama_host
        self.anthropic_api_key = anthropic_api_key


def _candidates(n: int = 3) -> list[tuple[Any, float]]:
    """构造 n 个测试候选，相似度递减。"""
    return [(make_skill(f"s{i}"), 0.9 - i * 0.1) for i in range(n)]


def test_reranker_none_is_passthrough_no_fallback_flag() -> None:
    """reranker=none 时只按 similarity 排，fallback=False。"""
    cands = _candidates(3)
    outcome = rerank("query", cands, top_k=3, settings=_FakeSettings(reranker="none"))
    assert outcome.fallback is False
    assert len(outcome.items) == 3
    # 顺序应与输入相似度一致
    assert [it.skill.id for it in outcome.items] == ["s0", "s1", "s2"]
    # 分数等于 similarity
    assert outcome.items[0].score == pytest.approx(0.9)


def test_reranker_none_respects_top_k() -> None:
    """top_k 限制返回数。"""
    outcome = rerank(
        "q", _candidates(5), top_k=2, settings=_FakeSettings(reranker="none")
    )
    assert len(outcome.items) == 2


def test_empty_candidates_returns_empty_no_fallback() -> None:
    """空输入：直接返回空 outcome，fallback=False。"""
    outcome = rerank("q", [], top_k=3, settings=_FakeSettings(reranker="none"))
    assert outcome.items == []
    assert outcome.fallback is False


def test_ollama_http_error_triggers_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """模拟 Ollama 拒绝连接：rerank 必须降级到 embedding-only，fallback=True。"""

    def _raise_connect_error(*args: Any, **kwargs: Any) -> Any:
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(reranker_mod, "_call_ollama", _raise_connect_error)

    cands = _candidates(3)
    outcome = rerank("q", cands, top_k=2, settings=_FakeSettings(reranker="ollama"))
    assert outcome.fallback is True
    assert len(outcome.items) == 2
    # 降级排序按 similarity，结果第一条仍是 s0
    assert outcome.items[0].skill.id == "s0"
    assert "embedding-only" in outcome.items[0].reason


def test_ollama_timeout_triggers_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """模拟 Ollama 超时同样降级。"""

    def _raise_timeout(*args: Any, **kwargs: Any) -> Any:
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(reranker_mod, "_call_ollama", _raise_timeout)

    outcome = rerank(
        "q", _candidates(3), top_k=3, settings=_FakeSettings(reranker="ollama")
    )
    assert outcome.fallback is True
    assert len(outcome.items) == 3


def test_invalid_json_response_triggers_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """LLM 返回非 JSON 字符串 → 降级。"""

    def _return_garbage(*args: Any, **kwargs: Any) -> str:
        return "this is not json at all, just garbage"

    monkeypatch.setattr(reranker_mod, "_call_ollama", _return_garbage)

    outcome = rerank(
        "q", _candidates(3), top_k=3, settings=_FakeSettings(reranker="ollama")
    )
    assert outcome.fallback is True
    assert all("embedding-only" in it.reason for it in outcome.items)


def test_empty_ranking_triggers_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """LLM 合法 JSON 但 ranking 为空 → 视为失败，降级。"""

    def _return_empty(*args: Any, **kwargs: Any) -> str:
        return json.dumps({"ranking": []})

    monkeypatch.setattr(reranker_mod, "_call_ollama", _return_empty)

    outcome = rerank(
        "q", _candidates(3), top_k=3, settings=_FakeSettings(reranker="ollama")
    )
    assert outcome.fallback is True


def test_ollama_valid_response_no_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """LLM 返回合法 JSON ranking 应被尊重，fallback=False。"""

    def _return_good(*args: Any, **kwargs: Any) -> str:
        return json.dumps(
            {
                "ranking": [
                    {"index": 2, "score": 95, "reason": "最相关"},
                    {"index": 1, "score": 60, "reason": "其次"},
                ]
            }
        )

    monkeypatch.setattr(reranker_mod, "_call_ollama", _return_good)

    cands = _candidates(3)
    outcome = rerank("q", cands, top_k=2, settings=_FakeSettings(reranker="ollama"))
    assert outcome.fallback is False
    assert len(outcome.items) == 2
    # index=2 → cands[1] = s1（1-based）
    assert outcome.items[0].skill.id == "s1"
    assert outcome.items[0].score == pytest.approx(0.95)
    assert outcome.items[0].reason == "最相关"


def test_haiku_missing_key_triggers_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """reranker=haiku 但未配 API key → 降级。"""
    outcome = rerank(
        "q",
        _candidates(2),
        top_k=2,
        settings=_FakeSettings(reranker="haiku", anthropic_api_key=None),
    )
    assert outcome.fallback is True
