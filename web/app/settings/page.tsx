'use client';

// /settings 页面：长表单分为 连接 / 外观 / 推荐参数 / 危险区 四个 section。
// 所有可写项即时落盘到 localStorage（key 形如 aiforge.*），不需要保存按钮。
// 展示型项目（reranker / embedder / retrieve_k 等）从 health 拉取，只读。

import * as React from 'react';
import { AlertTriangle, Palette, RotateCcw, Server, Sliders, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import type { HealthResponse } from '@/lib/api-types';
import { MOCK_HEALTH } from '@/lib/mock-data';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  KV, ReadonlyPill, Segmented, SettingRow, Toggle, fmtDuration, useLocalStorageString,
} from '@/components/settings/setting-row';
import { cn, fmtNumber } from '@/lib/utils';
import { toast } from 'sonner';

// localStorage key 定义
const LS = {
  apiBase: 'aiforge.api_base',
  apiKey: 'aiforge.api_key',
  theme: 'aiforge.theme',
  compact: 'aiforge.compact',
  topK: 'aiforge.top_k',
  maxTokens: 'aiforge.max_tokens',
} as const;

const ALL_LS_PREFIX = 'aiforge.';

type Theme = 'auto' | 'light' | 'dark';

export default function SettingsPage() {
  // 持久化值
  const [apiBase, setApiBase, apiBaseStatus] = useLocalStorageString<string>(LS.apiBase, 'http://localhost:8765');
  const [apiKey, setApiKey, apiKeyStatus] = useLocalStorageString<string>(LS.apiKey, '');
  const [theme, setTheme, themeStatus] = useLocalStorageString<Theme>(LS.theme, 'light', (raw) =>
    raw === 'auto' || raw === 'light' || raw === 'dark' ? (raw as Theme) : 'light'
  );
  const [compact, setCompactRaw, compactStatus] = useLocalStorageString<string>(LS.compact, '0');
  const [topK, setTopK, topKStatus] = useLocalStorageString<string>(LS.topK, '3');
  const [maxTokens, setMaxTokens, maxTokensStatus] = useLocalStorageString<string>(LS.maxTokens, '4000');

  // 连接测试 + 重置确认
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<
    { ok: true; data: HealthResponse } | { ok: false; error: string } | null
  >(null);
  const [resetOpen, setResetOpen] = React.useState(false);

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await api.health();
      setTestResult({ ok: true, data });
      toast.success('后端在线', {
        description: `版本 ${data.version} · ${data.skills_count} 个 artifact`,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : '未知错误';
      setTestResult({ ok: false, error: message });
      toast.error('连接失败', { description: message });
    } finally {
      setTesting(false);
    }
  }

  function handleResetLocal() {
    if (typeof window === 'undefined') return;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(ALL_LS_PREFIX)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
    setResetOpen(false);
    toast.success('本地配置已重置', {
      description: `清空了 ${keys.length} 个本地键，刷新页面以让默认值生效。`,
    });
  }

  // 展示型数据 from health（拉一次即可）
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  React.useEffect(() => {
    let canceled = false;
    api.health()
      .then((h) => { if (!canceled) setHealth(h); })
      .catch(() => { if (!canceled) setHealth(MOCK_HEALTH); });
    return () => { canceled = true; };
  }, []);

  return (
    <div className="space-y-8 pb-8">
      <PageHeader
        eyebrow="ADMIN · PREFERENCES"
        title={'参数与连接'}
        description={
          '所有修改都立即落盘到本地浏览器；后端只读项从 /v1/health 拉取，不可在此修改。'
        }
        actions={
          <span className="inline-flex items-center gap-1.5 text-2xs text-ink-400 font-mono">
            <Sparkles className="w-3 h-3 text-oxide-400" />
            本地配置 · v0.2
          </span>
        }
      />

      {/* —— 1. 连接 —— */}
      <Surface
        eyebrow="API CONNECTION"
        actions={
          <Button variant="secondary" size="sm" onClick={handleTestConnection} disabled={testing}>
            <Server className="w-3.5 h-3.5" />
            {testing ? '测试中…' : '测试连接'}
          </Button>
        }
      >
        <SettingRow
          label="后端地址"
          hint="next.config rewrite 会把 /api/* 转发到这个地址；改了要重启 dev server。"
          status={apiBaseStatus}
        >
          <Input
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://localhost:8765"
            className="font-mono"
          />
        </SettingRow>
        <SettingRow
          label="API Key"
          hint="可选；如果服务端配置了 AIFORGE_API_KEY，所有写操作需要带这个 token。"
          help="服务端若设置了 AIFORGE_API_KEY 环境变量，所有写操作（POST/PUT/DELETE）都需要在请求 Header 里带 Authorization: Bearer <token>。读取通常不受限。"
          status={apiKeyStatus}
          last={!testResult}
        >
          <Input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-… （留空表示无鉴权）"
            type="password"
            className="font-mono"
          />
        </SettingRow>
        {testResult && <ConnectionResult result={testResult} />}
      </Surface>

      {/* —— 2. 外观 —— */}
      <Surface
        eyebrow="APPEARANCE"
        actions={<Palette className="w-3.5 h-3.5 text-ink-300" />}
      >
        <SettingRow
          label="主题"
          hint="当前实现只支持 Light，Auto/Dark 计划在 v0.3 加入。"
          status={themeStatus}
        >
          <Segmented<Theme>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'auto', label: 'Auto', disabled: true, hint: 'v0.3 启用' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark', disabled: true, hint: 'v0.3 启用' },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="紧凑模式"
          hint="缩小表格行高与卡片间距；适合长列表浏览。"
          status={compactStatus}
        >
          <div className="flex items-center gap-3 pt-1">
            <Toggle
              checked={compact === '1'}
              onChange={(v) => setCompactRaw(v ? '1' : '0')}
              label="紧凑模式"
            />
            <span className="text-2xs text-ink-400">
              {compact === '1' ? '已启用' : '未启用'}
            </span>
          </div>
        </SettingRow>
        <SettingRow
          label="默认 top-K"
          hint="Playground 默认取多少条 artifact 注入。1–10。"
          status={topKStatus}
        >
          <Input
            type="number"
            min={1}
            max={10}
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
            className="font-mono w-32"
          />
        </SettingRow>
        <SettingRow
          label="默认 max_tokens"
          hint="单次推荐返回的 token 上限。超过则触发降级。"
          status={maxTokensStatus}
          last
        >
          <Input
            type="number"
            min={100}
            max={32000}
            step={100}
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            className="font-mono w-40"
          />
        </SettingRow>
      </Surface>

      {/* —— 3. 推荐参数（只读） —— */}
      <Surface
        eyebrow="RECOMMENDER"
        actions={
          <span className="inline-flex items-center gap-1.5 text-2xs text-ink-400 font-mono">
            <Sliders className="w-3 h-3" />
            来自后端 · 只读
          </span>
        }
      >
        <SettingRow
          label="Reranker 后端"
          hint="推荐用 Ollama 上的 Qwen2.5-1.5B；如想用 Haiku 把 RERANKER 环境变量改为 anthropic。"
          help="reranker 决定最终注入顺序。空值/不可用时退化为 embedding 相似度。"
        >
          <ReadonlyPill ok={health?.reranker_available}>
            {health?.reranker_available ? 'ollama · qwen2.5:1.5b' : '不可用 · embedding 兜底'}
          </ReadonlyPill>
        </SettingRow>
        <SettingRow
          label="Retrieve K"
          hint="第一阶段 embedding 召回的候选数；服务端环境变量 AIFORGE_RETRIEVE_K。"
        >
          <ReadonlyPill>{fmtNumber(50)} 条候选</ReadonlyPill>
        </SettingRow>
        <SettingRow
          label="Embedder 模型"
          hint="本地向量模型。首次推理会惰加载，加载完后保持在内存里。"
          last
        >
          <ReadonlyPill ok={health?.embedder_loaded}>
            {health?.embedder_loaded
              ? 'BAAI/bge-small-en-v1.5 · 已加载'
              : 'BAAI/bge-small-en-v1.5 · 惰加载'}
          </ReadonlyPill>
        </SettingRow>
      </Surface>

      {/* —— 4. 危险区 —— */}
      <Surface
        eyebrow="DANGER ZONE"
        className={cn('border border-ember-500/40 shadow-none')}
      >
        <SettingRow
          label="重置本地配置"
          hint="清空浏览器里所有 aiforge.* 的 localStorage 键。后端数据不受影响。"
          destructive
          last
        >
          <Button
            variant="danger"
            size="md"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw className="w-4 h-4" />
            重置本地配置
          </Button>
        </SettingRow>
      </Surface>

      {/* 重置确认 */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="!w-[480px]">
          <DialogHeader>
            <div className="flex items-center gap-2 label !mb-1 text-ember-500">
              <AlertTriangle className="w-3 h-3" />
              <span>RESET LOCAL CONFIG</span>
            </div>
            <DialogTitle>确认重置本地配置？</DialogTitle>
            <DialogDescription>
              所有 aiforge.* 的 localStorage 键会被清空，页面会恢复到首次进入时的默认值。
              该动作只影响本浏览器，不会触碰后端数据。
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 flex items-center justify-end gap-2 pt-2 border-t hairline border-t-ink-100/60">
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleResetLocal}>
              <RotateCcw className="w-4 h-4" />
              确认重置
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ConnectionResultData =
  | { ok: true; data: HealthResponse }
  | { ok: false; error: string };

function ConnectionResult({ result }: { result: ConnectionResultData }) {
  if (result.ok) {
    return (
      <div className="mt-4 -mb-2 rounded-md border border-oxide-200 bg-oxide-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="dot dot-live" />
          <span className="label !mb-0 text-oxide-600">HEALTH · OK</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <KV k="version" v={result.data.version} />
          <KV k="skills_count" v={fmtNumber(result.data.skills_count)} />
          <KV k="reranker" v={result.data.reranker_available ? 'available' : 'unavailable'} />
          <KV k="uptime" v={fmtDuration(result.data.uptime_seconds)} />
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 -mb-2 rounded-md border border-ember-500/30 bg-ember-100/40 p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-3.5 h-3.5 text-ember-500" />
        <span className="label !mb-0 text-ember-500">CONNECTION FAILED</span>
      </div>
      <p className="text-2xs text-ember-500/90 font-mono break-all">{result.error}</p>
    </div>
  );
}

