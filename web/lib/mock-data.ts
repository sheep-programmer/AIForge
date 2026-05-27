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

// —————————————————————————————————————————————————————————
// Insights 页面 mock 数据
// 所有数字都用伪随机但可复现的方式生成，避免 SSR/CSR mismatch。
// —————————————————————————————————————————————————————————

// 7×24 推荐次数矩阵：行=周一→周日，列=0-23 小时（UTC）。
// 工作时段（10-19 时）密度高，周末略低。
export const MOCK_HEATMAP_DATA: number[][] = Array.from({ length: 7 }).map((_, day) =>
  Array.from({ length: 24 }).map((__, hour) => {
    const work = hour >= 9 && hour <= 19 ? 1 : 0.25;
    const weekend = day >= 5 ? 0.55 : 1;
    const phase = Math.sin((hour - 6) / 24 * Math.PI * 2);
    const noise = ((day * 31 + hour * 17) % 13) / 13;
    return Math.max(0, Math.round((20 + phase * 28 + noise * 14) * work * weekend));
  })
);

// 延迟分桶直方图：0-500ms，每 10ms 一桶
export const MOCK_LATENCY_BUCKETS: { bucket: string; bucketStart: number; count: number }[] =
  Array.from({ length: 50 }).map((_, i) => {
    const start = i * 10;
    const end = start + 10;
    // 钟形分布，峰值在 80-120ms，长尾到 400ms+
    const center = 10;
    const dist = Math.abs(i - center);
    const base = Math.exp(-Math.pow(dist / 6, 2)) * 720;
    const tail = i > 20 ? Math.exp(-(i - 20) / 14) * 60 : 0;
    const noise = ((i * 37) % 11) / 11 * 18;
    return {
      bucket: `${start}-${end}`,
      bucketStart: start,
      count: Math.max(0, Math.round(base + tail + noise)),
    };
  });

// 当期 Top artifacts（含每天 7 天的调用数 sparkline）
export const MOCK_TOP_ARTIFACTS_BY_PERIOD: {
  id: string;
  name: string;
  artifact_type: 'skill' | 'mcp' | 'plugin';
  tags: string[];
  recommend_count: number;
  daily_calls: number[];
}[] = [
  { id: 'i9j0k1l2', name: 'superpowers', artifact_type: 'plugin', tags: ['refactor', 'testing', 'code-review'], recommend_count: 412, daily_calls: [42, 58, 51, 63, 70, 65, 63] },
  { id: 'a1b2c3d4', name: 'security-review', artifact_type: 'skill', tags: ['security', 'code-review'], recommend_count: 187, daily_calls: [18, 22, 26, 25, 30, 33, 33] },
  { id: 'e5f6g7h8', name: 'playwright-mcp', artifact_type: 'mcp', tags: ['browser-automation', 'testing'], recommend_count: 96, daily_calls: [12, 14, 11, 15, 13, 16, 15] },
  { id: 'q7r8s9t0', name: 'tailwind-ui-recipes', artifact_type: 'skill', tags: ['ui'], recommend_count: 73, daily_calls: [8, 10, 12, 9, 11, 13, 10] },
  { id: 'u1v2w3x4', name: 'postgres-migrate', artifact_type: 'skill', tags: ['db', 'devops'], recommend_count: 54, daily_calls: [6, 8, 7, 9, 8, 8, 8] },
  { id: 'arch-doc', name: 'arch-doc-writer', artifact_type: 'skill', tags: ['docs'], recommend_count: 48, daily_calls: [5, 7, 6, 8, 7, 8, 7] },
  { id: 'fs-mcp', name: 'fs-mcp', artifact_type: 'mcp', tags: ['devops'], recommend_count: 41, daily_calls: [4, 6, 5, 7, 6, 7, 6] },
  { id: 'pr-summary', name: 'pr-summary', artifact_type: 'plugin', tags: ['code-review', 'docs'], recommend_count: 36, daily_calls: [4, 5, 5, 6, 5, 6, 5] },
  { id: 'k8s-toolkit', name: 'k8s-toolkit', artifact_type: 'skill', tags: ['devops'], recommend_count: 29, daily_calls: [3, 4, 4, 5, 4, 5, 4] },
  { id: 'ghidra-bridge', name: 'ghidra-bridge', artifact_type: 'mcp', tags: ['reverse-engineering', 'security'], recommend_count: 22, daily_calls: [2, 3, 3, 4, 3, 4, 3] },
  { id: 'http-mcp', name: 'http-mcp', artifact_type: 'mcp', tags: ['devops'], recommend_count: 19, daily_calls: [2, 2, 3, 3, 3, 3, 3] },
  { id: 'tdd-loop', name: 'tdd-loop', artifact_type: 'skill', tags: ['testing'], recommend_count: 17, daily_calls: [1, 2, 2, 3, 3, 3, 3] },
];

// 推荐管线 funnel：各阶段保留的候选数（按一次请求的平均值）
export const MOCK_PIPELINE_FUNNEL: { stage: string; label: string; count: number; hint: string }[] = [
  { stage: 'embed', label: '查询向量化', count: 1, hint: 'embed(prompt) → 768d' },
  { stage: 'retrieved', label: '向量召回 · k=30', count: 30, hint: 'cosine top-30 from index' },
  { stage: 'deduped', label: '聚类去重', count: 12, hint: '相似簇内取代表' },
  { stage: 'reranked', label: '重排 top-k', count: 5, hint: 'Qwen-1.5B reranker' },
  { stage: 'fitted', label: 'Token 预算装配', count: 3, hint: '在 4000 token 内尽量放' },
];

// 每个 tag 在 skill / mcp / plugin 三种类型上的分布
export const MOCK_TAG_DISTRIBUTION: { tag: string; skill: number; mcp: number; plugin: number }[] = [
  { tag: 'testing', skill: 14, mcp: 9, plugin: 8 },
  { tag: 'code-review', skill: 13, mcp: 2, plugin: 7 },
  { tag: 'ui', skill: 18, mcp: 1, plugin: 4 },
  { tag: 'security', skill: 12, mcp: 4, plugin: 3 },
  { tag: 'devops', skill: 9, mcp: 5, plugin: 2 },
  { tag: 'browser-automation', skill: 4, mcp: 8, plugin: 2 },
  { tag: 'refactor', skill: 9, mcp: 0, plugin: 4 },
  { tag: 'db', skill: 8, mcp: 3, plugin: 0 },
  { tag: 'docs', skill: 6, mcp: 1, plugin: 2 },
  { tag: 'reverse-engineering', skill: 3, mcp: 5, plugin: 0 },
];

// artifact_type × tag 覆盖矩阵 — 单元格是该组合下的 artifact 数量
export const MOCK_COVERAGE_TAGS: string[] = [
  'browser-automation', 'reverse-engineering', 'ui', 'testing', 'security',
  'devops', 'db', 'docs', 'code-review', 'refactor',
  'data-science', 'cli', 'auth', 'observability', 'llm',
  'embedded', 'network', 'graphql', 'storage', 'search',
];

// 行序 skill / mcp / plugin
export const MOCK_COVERAGE_MATRIX: number[][] = [
  // skill
  [ 2,  3, 18, 14, 12,  9,  8,  6, 13,  9,  5,  7,  4,  3,  6,  1,  2,  2,  3,  4],
  // mcp
  [ 8,  5,  1,  9,  4,  5,  3,  1,  2,  0,  2,  1,  2,  4,  3,  0,  3,  1,  2,  3],
  // plugin
  [ 2,  0,  4,  8,  3,  2,  0,  2,  7,  4,  1,  3,  1,  1,  4,  0,  0,  1,  0,  2],
];

// 错误代码 top 3（过去 1 小时）
export const MOCK_TOP_ERRORS: { code: string; count: number; hint: string }[] = [
  { code: 'rerank_timeout', count: 4, hint: 'Qwen 推理 > 2.5s' },
  { code: 'embedder_oom', count: 2, hint: '批大小过大' },
  { code: 'budget_overflow', count: 1, hint: 'top-k 之和 > maxToken' },
];

// 时间序列：sparkline 用的精简 KPI 序列（按所选时段长度采样）
export const MOCK_KPI_TIMESERIES: { t: string; p50: number; p95: number; p99: number; calls: number }[] =
  Array.from({ length: 48 }).map((_, i) => {
    const seed = (i * 41 + 7) % 17;
    return {
      t: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`,
      p50: 86 + Math.round(Math.sin(i / 5) * 8 + seed / 2),
      p95: 230 + Math.round(Math.cos(i / 6) * 22 + seed * 1.4),
      p99: 390 + Math.round(Math.sin(i / 4 + 1) * 28 + seed * 1.1),
      calls: 18 + Math.round(Math.sin(i / 3) * 8 + seed),
    };
  });
