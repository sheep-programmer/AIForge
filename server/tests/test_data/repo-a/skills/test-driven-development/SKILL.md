---
name: test-driven-development
description: 强制 RED-GREEN-REFACTOR 流程；写失败测试 → 看它失败 → 最小代码让它通过 → 重构
---
# Test-Driven Development

当用户开始实现新功能时激活。强制以下流程：

1. 先写一个失败的测试，明确描述期望行为
2. 运行测试，**看着它失败**（确认测试本身有效）
3. 写最少的代码让测试通过
4. 重构

绝不跳过步骤 2。绝不在没有测试的情况下写实现代码。
