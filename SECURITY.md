# 安全策略

> English: [SECURITY.en.md](SECURITY.en.md)

## 漏洞报告

请发送邮件到 security@aiforge.invalid（请替换为你的真实联系方式），包含：
- 问题描述
- 复现步骤
- 影响评估

我们会在 72 小时内响应。请不要在 public issue 中提交安全报告。

## 威胁模型

AIForge 设计上跑在受信服务器。推荐部署方式：
- 绑定 `127.0.0.1` 或私有网络
- 反向代理（nginx / caddy）+ TLS
- 可选 `AIFORGE_API_KEY` 用于写操作
- **不**支持直接暴露公网（没有自建鉴权层的情况下）

## 我们承诺

- `SKILL.md` 内容**作为不可信文本处理**，永远不会被执行
- Ingest 在沙箱 temp 目录克隆，只读取 `SKILL.md`，结束后删除
- 远程 skill-finder **默认关闭**，启用后需要人工显式批准才入库
- 插件只发送用户 prompt 到服务端，**永远不发送源码或文件内容**

## 我们暂未承诺

- `SKILL.md` body 的完整输入清洗（embedding 在原始 markdown 上计算）
- 推荐端点的速率限制（请在反向代理层配置）
- 多租户隔离 —— AIForge 是单租户设计

## 依赖更新

我们关注 `sentence-transformers`、`fastapi`、`sqlalchemy`、`sqlite-vss` 的 Anthropic / OSS 安全公告。
