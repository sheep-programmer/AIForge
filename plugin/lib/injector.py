"""把 :class:`RecommendResponse` 渲染为注入到 agent 上下文的 XML 块。"""

from __future__ import annotations

from client import RecommendResponse


_HEADER = (
    "本次对话最相关的 skill（由 AIForge 自动筛选并注入，请优先使用）：\n"
)

_HEADER_FALLBACK = (
    "本次对话最相关的 skill（AIForge 本地兜底模式 — 服务端不可达，"
    "结果基于本地缓存关键词检索，质量可能不及在线模型）：\n"
)


def format_injection(resp: RecommendResponse) -> str:
    """渲染注入文本。无推荐时返回空字符串。"""
    if not resp.recommendations:
        return ""

    lines: list[str] = []
    tag = "aiforge-recommendations"
    lines.append(f"<{tag}>")
    lines.append(_HEADER_FALLBACK if resp.fallback_used else _HEADER)
    lines.append("")

    for idx, rec in enumerate(resp.recommendations, start=1):
        lines.append(f"## {idx}. {rec.name}")
        if rec.description:
            lines.append(f"_{rec.description}_")
            lines.append("")
        if rec.rerank_reason:
            lines.append(f"> 选中理由：{rec.rerank_reason}")
            lines.append("")
        if rec.body:
            lines.append(rec.body.rstrip())
        if rec.source_url:
            lines.append("")
            lines.append(f"来源：{rec.source_url}")
        lines.append("")
        lines.append("---")
        lines.append("")

    # 收尾去掉多余分隔
    while lines and lines[-1] in {"", "---"}:
        lines.pop()

    if resp.fallback_used:
        lines.append("")
        lines.append("<aiforge-fallback-mode>true</aiforge-fallback-mode>")

    lines.append(f"</{tag}>")
    return "\n".join(lines)
