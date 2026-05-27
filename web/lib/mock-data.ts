// 离线/演示数据：服务端不可达时回退展示。
// 真实生产请确保后端在 :8765 上运行，next.config 的 rewrite 会自动代理。

import type {
  ArtifactBrief,
  ArtifactDetail,
  HealthResponse,
  IngestJob,
  PendingDiscovery,
  RecommendResponse,
  TagItem,
} from './api-types';

export const MOCK_HEALTH: HealthResponse = {
  status: 'ok',
  version: '0.2.0',
  skills_count: 312,
  reranker_available: true,
  embedder_loaded: true,
  uptime_seconds: 86400 * 3 + 12_345,
};

const NOW = new Date();
const minus = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

export const MOCK_ARTIFACTS: ArtifactBrief[] = [
  {
    id: 'a1b2c3d4',
    name: 'security-review',
    description: 'OWASP top-10 漏洞审查 + 密钥泄露扫描',
    source_url: 'https://github.com/anthropics/skills',
    source_repo: 'anthropics/skills',
    source_stars: 4821,
    is_active: true,
    body_tokens: 1240,
    recommend_count: 187,
    updated_at: minus(0.5),
    artifact_type: 'skill',
    tags: ['security', 'code-review'],
  },
  {
    id: 'e5f6g7h8',
    name: 'playwright-mcp',
    description: '浏览器自动化 MCP：截图、表单、E2E',
    source_url: 'https://github.com/playwright-org/mcp',
    source_repo: 'playwright-org/mcp',
    source_stars: 2150,
    is_active: true,
    body_tokens: 320,
    recommend_count: 96,
    updated_at: minus(1.2),
    artifact_type: 'mcp',
    tags: ['browser-automation', 'testing'],
  },
  {
    id: 'i9j0k1l2',
    name: 'superpowers',
    description: '高质量通用 skill 套件：refactor、TDD、PR 总结',
    source_url: 'https://github.com/obra/superpowers-skills',
    source_repo: 'obra/superpowers-skills',
    source_stars: 8120,
    is_active: true,
    body_tokens: 5230,
    recommend_count: 412,
    updated_at: minus(0.1),
    artifact_type: 'plugin',
    tags: ['refactor', 'testing', 'code-review'],
  },
  {
    id: 'm3n4o5p6',
    name: 'ghidra-bridge',
    description: '本地 Ghidra 桥：把反编译结果喂给 agent',
    source_url: 'https://github.com/sec-tools/ghidra-mcp',
    source_repo: 'sec-tools/ghidra-mcp',
    source_stars: 612,
    is_active: false,
    body_tokens: 410,
    recommend_count: 8,
    updated_at: minus(7),
    artifact_type: 'mcp',
    tags: ['reverse-engineering', 'security'],
  },
  {
    id: 'q7r8s9t0',
    name: 'tailwind-ui-recipes',
    description: '组件级 UI 模式与可复用 Tailwind 配方',
    source_url: 'https://github.com/ui-stuff/tw-recipes',
    source_repo: 'ui-stuff/tw-recipes',
    source_stars: 1455,
    is_active: true,
    body_tokens: 2100,
    recommend_count: 73,
    updated_at: minus(2.5),
    artifact_type: 'skill',
    tags: ['ui'],
  },
  {
    id: 'u1v2w3x4',
    name: 'postgres-migrate',
    description: '安全数据库迁移：在线 schema 变更、回滚演练',
    source_url: 'https://github.com/datalab/pg-migrate-skill',
    source_repo: 'datalab/pg-migrate-skill',
    source_stars: 952,
    is_active: true,
    body_tokens: 1860,
    recommend_count: 54,
    updated_at: minus(3.2),
    artifact_type: 'skill',
    tags: ['db', 'devops'],
  },
];

export const MOCK_ARTIFACT_DETAIL: ArtifactDetail = {
  ...MOCK_ARTIFACTS[1],
  body:
    '# Playwright MCP\n\nProvides headless browser automation via the Model Context Protocol.\n\n## Tools\n\n- `navigate(url)` — open URL\n- `screenshot()` — capture viewport\n- `fill(selector, value)` — type into input\n- `click(selector)` — click element\n\n## Example\n\nUse this when you need to verify a UI feature works end-to-end without running a full test framework.',
  source_path: 'mcp.json',
  license: 'MIT',
  cluster_id: 2,
  is_approved: true,
  created_at: minus(45),
  last_recommended_at: minus(0.04),
  mcp_config: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    env: {},
  },
  plugin_manifest: null,
};

export const MOCK_TAGS: TagItem[] = [
  { name: 'browser-automation', description: 'Playwright/Puppeteer/Selenium 等浏览器自动化', is_builtin: true, artifact_count: 14, created_at: minus(30) },
  { name: 'reverse-engineering', description: '二进制/协议逆向、反编译、调试器', is_builtin: true, artifact_count: 8, created_at: minus(30) },
  { name: 'ui', description: '前端界面构建、组件库、设计系统', is_builtin: true, artifact_count: 23, created_at: minus(30) },
  { name: 'testing', description: '单元/集成/E2E 测试、test runner', is_builtin: true, artifact_count: 31, created_at: minus(30) },
  { name: 'security', description: '代码安全审查、漏洞扫描、密钥管理', is_builtin: true, artifact_count: 19, created_at: minus(30) },
  { name: 'devops', description: 'CI/CD、容器、部署、基础设施', is_builtin: true, artifact_count: 16, created_at: minus(30) },
  { name: 'db', description: '数据库建模、迁移、查询优化', is_builtin: true, artifact_count: 11, created_at: minus(30) },
  { name: 'docs', description: '文档生成、README、API 文档', is_builtin: true, artifact_count: 9, created_at: minus(30) },
  { name: 'code-review', description: 'PR 审查、风格检查、最佳实践', is_builtin: true, artifact_count: 22, created_at: minus(30) },
  { name: 'refactor', description: '重构、代码整理、依赖梳理', is_builtin: true, artifact_count: 13, created_at: minus(30) },
];

export const MOCK_INGEST_JOB: IngestJob = {
  job_id: 'job_01HXY...DEMO',
  status: 'embedding',
  source_url: 'https://github.com/obra/superpowers-skills',
  skills_added: 0,
  skills_updated: 0,
  error: null,
};

export const MOCK_RECOMMENDATION: RecommendResponse = {
  request_id: 'req_DEMO',
  elapsed_ms: 142,
  candidates_considered: 28,
  fallback_used: false,
  recommendations: [
    {
      ...MOCK_ARTIFACTS[0],
      skill_id: MOCK_ARTIFACTS[0].id,
      body: '# Security Review\n\n...',
      score: 0.91,
      rerank_reason: '直接对应 PR 安全审查需求',
      tokens: MOCK_ARTIFACTS[0].body_tokens,
      mcp_config: null,
      plugin_manifest: null,
    },
    {
      ...MOCK_ARTIFACTS[2],
      skill_id: MOCK_ARTIFACTS[2].id,
      body: '# Superpowers\n\n...',
      score: 0.78,
      rerank_reason: '覆盖 code-review 工作流',
      tokens: MOCK_ARTIFACTS[2].body_tokens,
      mcp_config: null,
      plugin_manifest: null,
    },
  ],
};

export const MOCK_DISCOVERIES: PendingDiscovery[] = [
  {
    id: 'disc_001',
    source_url: 'https://github.com/awesome-org/agent-tools',
    source_repo: 'awesome-org/agent-tools',
    source_stars: 4012,
    skill_count: 12,
    sample_skill_names: ['code-search', 'doc-generator', 'pr-summary'],
    found_via: 'github-search',
    found_at: minus(0.3),
    decision: 'pending',
  },
  {
    id: 'disc_002',
    source_url: 'https://github.com/dev-tools/mcp-suite',
    source_repo: 'dev-tools/mcp-suite',
    source_stars: 1820,
    skill_count: 5,
    sample_skill_names: ['fs-mcp', 'sql-mcp', 'http-mcp'],
    found_via: 'trending',
    found_at: minus(1.1),
    decision: 'pending',
  },
];

// 24 小时内的推荐次数（用于 dashboard sparkline）
export const MOCK_RECOMMEND_TIMESERIES: { hour: string; calls: number; latency: number }[] = [
  ...Array.from({ length: 24 }).map((_, i) => {
    const base = 12 + Math.round(Math.sin(i / 3) * 6 + Math.random() * 8);
    return {
      hour: `${String(i).padStart(2, '0')}:00`,
      calls: Math.max(0, base),
      latency: 90 + Math.round(Math.cos(i / 4) * 30 + Math.random() * 20),
    };
  }),
];
