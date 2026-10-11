/**
 * 产业链侦察兵 · 设计系统原子组件
 *
 * 抽出这些原子的目的：把散落在各页面的 `#C7000B` 硬编码与重复样式收敛到一处，
 * 保证「红色只用于品牌 / 主操作 / 关键数字 / 涨」这条视觉规则能被复用。
 */
import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/* 胶囊标签                                                            */
/* ------------------------------------------------------------------ */

export function Chip({
  children,
  tone = 'default',
  className = '',
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'brand' | 'ok' | 'line';
  className?: string;
  title?: string;
}) {
  const tones: Record<string, string> = {
    default: 'bg-hairline-soft text-ink-soft',
    brand: 'bg-brand-soft text-brand font-semibold',
    ok: 'bg-down/10 text-down font-semibold',
    line: 'bg-transparent border border-hairline text-ink-mute',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11.5px] leading-none whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 卡片                                                                */
/* ------------------------------------------------------------------ */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-hairline rounded-2xl shadow-[0_1px_2px_rgba(20,34,74,.05)] ${className}`}>
      {children}
    </section>
  );
}

export function CardHead({
  title,
  icon,
  extra,
  className = '',
}: {
  title: ReactNode;
  icon?: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex items-center gap-2 px-[18px] py-[14px] border-b border-hairline-soft ${className}`}>
      {icon}
      <h2 className="text-[13.5px] font-bold tracking-[.2px] text-ink">{title}</h2>
      <div className="ml-auto flex items-center gap-2">{extra}</div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* 按钮                                                                */
/* ------------------------------------------------------------------ */

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const pad =
    size === 'lg'
      ? 'px-[26px] py-3 text-[14px]'
      : size === 'sm'
        ? 'px-3 py-1.5 text-[12px] rounded-lg gap-1.5'
        : 'px-6 py-[11px] text-[13.5px]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[11px] font-bold tracking-[.3px] text-white
        border-0 bg-gradient-to-br from-[#D4000E] to-brand-deep
        shadow-[0_6px_18px_-8px_rgba(199,0,11,.55)]
        transition-[transform,box-shadow] duration-150
        hover:-translate-y-px hover:shadow-[0_10px_24px_-8px_rgba(199,0,11,.6)]
        active:translate-y-0 disabled:opacity-55 disabled:cursor-default disabled:shadow-none disabled:translate-y-0
        ${pad} ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  active,
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-[9px] border px-[13px] py-[7px] text-[12.5px] whitespace-nowrap transition-colors
        ${active ? 'border-brand text-brand bg-brand-soft' : 'border-hairline text-ink-soft bg-white hover:border-ink-faint hover:text-ink'}
        ${className}`}
    >
      {children}
    </button>
  );
}

export function SmallButton({
  children,
  onClick,
  solid,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  solid?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors
        ${solid ? 'bg-ink text-white border-ink hover:bg-[#0C1730]' : 'bg-white border-hairline text-ink-soft hover:border-ink-faint hover:text-ink'}
        ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 分数环                                                              */
/* ------------------------------------------------------------------ */

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#F1F2F6" strokeWidth="11" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="#C7000B"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 264} 264`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-[13px] font-bold text-brand leading-none">{score}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 指标                                                                */
/* ------------------------------------------------------------------ */

export function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] tracking-[.3px] text-ink-faint">{label}</div>
      <div className="mt-[3px] text-[16px] font-bold tabular-nums leading-tight">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 折叠区                                                              */
/* ------------------------------------------------------------------ */

export function Fold({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group bg-white border border-hairline rounded-xl mt-[15px] overflow-hidden" open={defaultOpen}>
      <summary
        className="list-none cursor-pointer px-[18px] py-[13px] flex items-center gap-2.5 text-[12.5px] font-semibold text-ink-soft
          hover:bg-[#FBFCFE] hover:text-ink transition-colors
          group-open:border-b group-open:border-hairline-soft group-open:text-ink
          [&::-webkit-details-marker]:hidden"
      >
        {icon}
        {title}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto text-ink-faint transition-transform group-open:rotate-90"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="px-[18px] py-4">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* 空态图标底衬                                                        */
/* ------------------------------------------------------------------ */

export function IconBubble({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`grid place-items-center w-[26px] h-[26px] shrink-0 rounded-lg bg-brand-soft text-brand ${className}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 文字按钮                                                            */
/* ------------------------------------------------------------------ */

export function TextButton({
  children,
  onClick,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-[12px] font-medium transition-colors
        ${tone === 'danger' ? 'text-[#D93025] hover:bg-red-50' : 'text-ink-soft hover:bg-hairline-soft hover:text-ink'}
        ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 页面骨架：四个配置页共用同一套外壳，保证与工作台风格一致                */
/* ------------------------------------------------------------------ */

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-[#F4F6FA]">
      <div className="max-w-[1240px] mx-auto px-4 py-5 pb-[150px] lg:px-[26px] lg:py-6 lg:pb-10 space-y-5">
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-[19px] lg:text-[21px] font-bold tracking-[.2px] text-ink">{title}</h1>
        {desc && <p className="text-[12.5px] mt-1.5 leading-[1.7] text-ink-mute max-w-[760px]">{desc}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}

/** 表单字段：标签 + 控件 + 可选提示，统一字号与间距 */
export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium mb-1.5 text-ink-soft">{label}</div>
      {children}
      {hint && <div className="text-[11px] mt-1 leading-[1.6] text-ink-faint">{hint}</div>}
    </label>
  );
}

/** 带标题的卡片区块，等价于 Card + CardHead + 内边距 */
export function SectionCard({
  title,
  icon,
  extra,
  children,
  bodyClassName = 'p-5',
}: {
  title: ReactNode;
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <Card>
      <CardHead title={title} icon={icon} extra={extra} />
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

/** 区块内的小标题（如「① 登录」「② 拉取列表」） */
export function StepLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12.5px] font-bold text-brand pt-1">
      {children}
    </div>
  );
}

/** 空状态 / 加载态占位 */
export function Placeholder({ icon, title, desc }: { icon?: ReactNode; title: string; desc?: string }) {
  return (
    <div className="py-14 text-center">
      {icon && <div className="flex justify-center mb-3 text-ink-faint">{icon}</div>}
      <p className="text-[13px] text-ink-mute">{title}</p>
      {desc && <p className="text-[11.5px] text-ink-faint mt-1.5">{desc}</p>}
    </div>
  );
}
