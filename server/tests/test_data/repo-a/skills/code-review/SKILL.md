---
name: code-review
description: 审查代码变更，发现 bug、安全问题、可维护性问题
---
# Code Review

审查清单：

- 安全：OWASP top 10（SQL 注入、XSS、CSRF、不安全反序列化）
- 错误处理：边界条件、异常路径
- 性能：明显的低效循环、N+1 查询
- 可维护性：命名、抽象层次、注释
- 测试：覆盖率、边界用例
