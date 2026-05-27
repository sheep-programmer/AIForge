// 批量操作辅助：服务端无 bulk 接口，这里在客户端按 N 个 ID fan-out。
// 每个操作把 ID 列表切成 5 个并发的 chunk，Promise.allSettled 等待完成。
// onProgress 在每个请求 settle 后回调，调用方可以渲染进度。

import { api } from './api-client';

const CONCURRENCY = 5;

export interface BulkResult {
  ok: string[];
  failed: { id: string; error: string }[];
}

export interface BulkOpts {
  onProgress?: (done: number, total: number) => void;
}

type Operation = (id: string) => Promise<unknown>;

async function runFanOut(
  ids: string[],
  op: Operation,
  opts?: BulkOpts
): Promise<BulkResult> {
  const result: BulkResult = { ok: [], failed: [] };
  let done = 0;
  const total = ids.length;

  // 简单的滑动窗口：把 ids 切成 chunk 大小为 CONCURRENCY，按 chunk 串行、chunk 内并行。
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async (id) => {
        await op(id);
        return id;
      })
    );
    settled.forEach((r, idx) => {
      done += 1;
      const id = chunk[idx];
      if (r.status === 'fulfilled') {
        result.ok.push(id);
      } else {
        const reason = r.reason;
        const message =
          reason instanceof Error ? reason.message : String(reason ?? 'unknown error');
        result.failed.push({ id, error: message });
      }
      opts?.onProgress?.(done, total);
    });
  }

  return result;
}

export function bulkAddTag(
  ids: string[],
  tag: string,
  opts?: BulkOpts
): Promise<BulkResult> {
  const clean = tag.trim().toLowerCase();
  return runFanOut(ids, (id) => api.addArtifactTag(id, clean, 'manual'), opts);
}

export function bulkRemoveTag(
  ids: string[],
  tag: string,
  opts?: BulkOpts
): Promise<BulkResult> {
  const clean = tag.trim().toLowerCase();
  return runFanOut(ids, (id) => api.removeArtifactTag(id, clean), opts);
}

export function bulkToggleActive(
  ids: string[],
  active: boolean,
  opts?: BulkOpts
): Promise<BulkResult> {
  return runFanOut(ids, (id) => api.patchArtifact(id, { is_active: active }), opts);
}

export function bulkDelete(ids: string[], opts?: BulkOpts): Promise<BulkResult> {
  return runFanOut(ids, (id) => api.deleteArtifact(id), opts);
}

/** 一次替换某个 artifact 的全量 tag 集合 —— 给「替换模式」用。 */
export function bulkReplaceTags(
  items: { id: string; tags: string[] }[],
  opts?: BulkOpts
): Promise<BulkResult> {
  const ids = items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i.tags]));
  return runFanOut(
    ids,
    async (id) => {
      const next = byId.get(id) ?? [];
      await api.setArtifactTags(id, next);
    },
    opts
  );
}
