---
name: security-audit
description: 对代码库做安全审计，重点关注认证、授权、数据流
---
# Security Audit

聚焦区域：

1. 认证：密码哈希、token 生成、session 管理
2. 授权：RBAC、最小权限、横向越权
3. 输入校验：所有用户输入都在边界验证
4. 数据流：敏感数据加密存储、安全传输
5. 第三方依赖：漏洞扫描、版本固定
