/**
 * 历史记录抽屉。
 *
 * 客户经理常见的诉求是「上周那条还能不能复用」——所以这里不只是展示，
 * 点击任意一条会把它重新载入工作台（含文案与 Banner），可直接再次复制发送。
 */
import { useEffect, useState } from 'react';
import { MessagePlugin } from 'tdesign-react';
import { Clock, X, Loader2, History as HistoryIcon } from 'lucide-react';
import { api, type PipelineRun, type RunSummary } from '../../api/scout';
import { Chip, GhostButton } from './atoms';

function fmt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${wd} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function HistoryDrawer({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (run: PipelineRun) => void;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .runs()
      .then((r) => setRuns(r.runs))
      .catch((e) => MessagePlugin.error(`读取历史记录失败：${e.message}`))
      .finally(() => setLoading(false));
  }, [open]);

  const pick = async (id: string) => {
    setPicking(id);
    try {
      const detail = await api.runDetail(id);
      if (!detail.report) {
        MessagePlugin.warning('该次记录没有生成文案，无法载入');
        return;
      }
      onPick(detail);
      onClose();
      MessagePlugin.success('已载入该次日报');
    } catch (e: any) {
      MessagePlugin.error(e.message);
    } finally {
      setPicking('');
    }
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-[rgba(20,34,74,.35)] transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      {/* 抽屉 */}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-[420px] max-w-[92vw] bg-white border-l border-hairline
          flex flex-col shadow-[-16px_0_48px_-24px_rgba(20,34,74,.35)] transition-transform duration-250
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center gap-2.5 px-5 py-4 border-b border-hairline-soft">
          <HistoryIcon size={17} className="text-brand" />
          <h2 className="text-[14.5px] font-bold text-ink">历史记录</h2>
          <span className="ml-1 text-[11.5px] text-ink-faint">{runs.length} 条</span>
          <button
            onClick={onClose}
            className="ml-auto grid place-items-center w-7 h-7 rounded-lg border-0 bg-transparent text-ink-mute hover:bg-hairline-soft hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-mute">
              <Loader2 size={16} className="animate-spin text-brand" />
              正在读取…
            </div>
          )}

          {!loading && runs.length === 0 && (
            <div className="py-16 text-center">
              <Clock size={34} className="mx-auto mb-3 text-ink-faint" />
              <p className="text-[13px] text-ink-mute">还没有生成记录</p>
              <p className="text-[11.5px] text-ink-faint mt-1.5">生成一次日报后，这里会保留历史</p>
            </div>
          )}

          {!loading && runs.length > 0 && (
            <ul className="space-y-2.5">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => pick(r.id)}
                    disabled={!!picking}
                    className="w-full text-left bg-white border border-hairline rounded-xl px-[15px] py-[13px]
                      hover:border-[#D9DEEA] hover:shadow-[0_2px_6px_-2px_rgba(20,34,74,.06),0_12px_28px_-14px_rgba(20,34,74,.14)]
                      transition-all disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                      {picking === r.id ? <Loader2 size={11} className="animate-spin text-brand" /> : <Clock size={11} />}
                      {fmt(r.startedAt)}
                      {r.status !== 'success' && (
                        <Chip tone="line" className="ml-auto">
                          生成失败
                        </Chip>
                      )}
                    </div>
                    <div className="mt-1.5 text-[12.5px] font-semibold leading-[1.55] text-ink line-clamp-2">
                      {r.topEventTitle || '（无头号事件）'}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-mute">
                      <Chip>{r.templateName}</Chip>
                      {r.status === 'success' && (
                        <span className="font-semibold text-brand">{r.topEventScore} 分</span>
                      )}
                      {r.llmEnhanced && <Chip tone="ok">AI 润色</Chip>}
                      <span className="ml-auto">抓取 {r.fetched} 条</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-hairline-soft flex items-center gap-2">
          <span className="text-[11px] text-ink-faint">点击任意一条可重新载入工作台</span>
          <GhostButton onClick={onClose} className="ml-auto">
            关闭
          </GhostButton>
        </footer>
      </aside>
    </>
  );
}
