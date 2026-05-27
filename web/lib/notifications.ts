// 通知 mock 流：给 NotificationsDrawer 一个真实感的数据源。
// 真实接入后端事件流之后，此文件应改为订阅 SSE / WS 而非生成静态数据。

export type NotificationKind =
  | 'ingest_done'
  | 'ingest_failed'
  | 'autotag_done'
  | 'discovery_new'
  | 'gateway_offline'
  | 'system_upgrade'
  | 'auth_required';

export type NotificationCategory = 'jobs' | 'discoveries' | 'system';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  title: string;
  description: string;
  /** ISO timestamp */
  timestamp: string;
  read: boolean;
  status: 'success' | 'warn' | 'error' | 'info';
}

const NOW = Date.now();
const minus = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const SEED: Omit<NotificationItem, 'id'>[] = [
  {
    kind: 'ingest_done',
    category: 'jobs',
    title: '入库完成 · obra/superpowers-skills',
    description: '+24 artifacts · 串行 embed 用时 12.4s',
    timestamp: minus(4 * MIN),
    read: false,
    status: 'success',
  },
  {
    kind: 'autotag_done',
    category: 'jobs',
    title: '自动打标任务结束',
    description: '17 项处理完毕 · 平均 1.4 tag/artifact',
    timestamp: minus(22 * MIN),
    read: false,
    status: 'success',
  },
  {
    kind: 'discovery_new',
    category: 'discoveries',
    title: '发现高质量仓库 · awesome-org/agent-tools',
    description: '12 个候选 skill · 4.0k star · 等待审批',
    timestamp: minus(48 * MIN),
    read: false,
    status: 'info',
  },
  {
    kind: 'gateway_offline',
    category: 'system',
    title: 'MCP gateway 降级',
    description: 'ghidra-bridge 心跳超时 90s, 临时下线',
    timestamp: minus(2 * HOUR),
    read: true,
    status: 'warn',
  },
  {
    kind: 'ingest_failed',
    category: 'jobs',
    title: '入库失败 · sec-tools/ghidra-mcp',
    description: '远端 401 · 重试 3 次仍失败',
    timestamp: minus(3 * HOUR + 12 * MIN),
    read: true,
    status: 'error',
  },
  {
    kind: 'discovery_new',
    category: 'discoveries',
    title: '发现新趋势项 · dev-tools/mcp-suite',
    description: '5 个 MCP 子工具 · 1.8k star',
    timestamp: minus(5 * HOUR),
    read: true,
    status: 'info',
  },
  {
    kind: 'system_upgrade',
    category: 'system',
    title: 'AIForge 0.2.0 已部署',
    description: 'reranker 换至 Qwen-2.5-1.5B · 平均延迟下降 38%',
    timestamp: minus(DAY + 2 * HOUR),
    read: true,
    status: 'success',
  },
  {
    kind: 'autotag_done',
    category: 'jobs',
    title: '自动打标任务结束',
    description: '64 项处理完毕 · 全量重打',
    timestamp: minus(DAY + 4 * HOUR),
    read: true,
    status: 'success',
  },
  {
    kind: 'auth_required',
    category: 'system',
    title: 'GitHub PAT 即将过期',
    description: '剩余 6 天 · 请在 设置 → API 重新生成',
    timestamp: minus(DAY + 6 * HOUR),
    read: false,
    status: 'warn',
  },
  {
    kind: 'discovery_new',
    category: 'discoveries',
    title: '新候选 · ui-stuff/tw-recipes',
    description: '1.4k star · 命中 ui / refactor 双标签',
    timestamp: minus(2 * DAY + 1 * HOUR),
    read: true,
    status: 'info',
  },
  {
    kind: 'ingest_done',
    category: 'jobs',
    title: '入库完成 · datalab/pg-migrate-skill',
    description: '+6 artifacts · 1 条 description 自动改写',
    timestamp: minus(2 * DAY + 5 * HOUR),
    read: true,
    status: 'success',
  },
  {
    kind: 'gateway_offline',
    category: 'system',
    title: 'Embedder 冷启动',
    description: 'BGE-small 重新加载用时 8.7s',
    timestamp: minus(3 * DAY + 30 * MIN),
    read: true,
    status: 'info',
  },
  {
    kind: 'system_upgrade',
    category: 'system',
    title: '后端依赖刷新',
    description: 'asyncpg 0.30 · pydantic 2.9 · alembic 1.13',
    timestamp: minus(5 * DAY),
    read: true,
    status: 'success',
  },
];

export function getMockNotifications(): NotificationItem[] {
  return SEED.map((n, i) => ({ ...n, id: `ntf_${String(i).padStart(3, '0')}` }));
}

export function bucketByDate(items: NotificationItem[]): {
  bucket: 'today' | 'yesterday' | 'week' | 'older';
  label: string;
  items: NotificationItem[];
}[] {
  const today: NotificationItem[] = [];
  const yesterday: NotificationItem[] = [];
  const week: NotificationItem[] = [];
  const older: NotificationItem[] = [];
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - DAY;
  const startWeek = startToday - 6 * DAY;
  for (const n of items) {
    const t = new Date(n.timestamp).getTime();
    if (t >= startToday) today.push(n);
    else if (t >= startYesterday) yesterday.push(n);
    else if (t >= startWeek) week.push(n);
    else older.push(n);
  }
  return [
    { bucket: 'today' as const, label: '今天', items: today },
    { bucket: 'yesterday' as const, label: '昨天', items: yesterday },
    { bucket: 'week' as const, label: '本周', items: week },
    { bucket: 'older' as const, label: '更早', items: older },
  ].filter((g) => g.items.length > 0);
}
