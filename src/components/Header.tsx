/**
 * 会话区顶栏：当前会话标题、新建会话、设置入口、主题切换。
 */
import { Tooltip } from 'tdesign-react';
import { RefreshIcon, SunnyIcon, MoonIcon, MenuFoldIcon, MenuUnfoldIcon } from 'tdesign-icons-react';
import { Bot } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Model, Session, Agent, Theme } from '../types';
import { ICON_MAP } from '../utils/iconMap';
import { Chip } from './scout/atoms';

interface HeaderProps {
  isSettingsPage: boolean;
  sidebarOpen: boolean;
  theme: Theme;
  currentSession: Session | undefined;
  currentAgent: Agent | undefined;
  models: Model[];
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onRefreshModels: () => void;
}

/** 图标按钮：与工作台顶栏的幽灵按钮保持同一套视觉 */
function IconButton({
  onClick,
  title,
  children,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={title}>
      <button
        onClick={onClick}
        className="grid place-items-center w-8 h-8 rounded-[9px] border border-hairline bg-white text-ink-soft
          hover:border-ink-faint hover:text-ink transition-colors"
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function Header({
  isSettingsPage,
  sidebarOpen,
  theme,
  currentSession,
  currentAgent,
  models,
  onToggleSidebar,
  onToggleTheme,
  onRefreshModels,
}: HeaderProps) {
  const formatModelName = (modelId: string) => {
    const model = models.find((m) => m.modelId === modelId);
    const name = model?.name || modelId;
    return (
      name
        .replace(/^(Claude|GPT|Gemini|Kimi|DeepSeek|Qwen|GLM)\s*/i, '')
        .replace(/-/g, ' ')
        .trim() || name
    );
  };

  return (
    <header className="flex items-center gap-2.5 flex-wrap px-4 py-3 bg-white border-b border-hairline shrink-0">
      <button
        onClick={onToggleSidebar}
        title={sidebarOpen ? '收起会话列表' : '展开会话列表'}
        className="grid place-items-center w-8 h-8 rounded-[9px] border-0 bg-transparent text-ink-soft hover:bg-hairline-soft hover:text-ink transition-colors"
      >
        {sidebarOpen ? <MenuFoldIcon /> : <MenuUnfoldIcon />}
      </button>

      {!isSettingsPage && currentAgent && (
        <div
          className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
          style={{ backgroundColor: currentAgent.color || '#C7000B' }}
        >
          {(() => {
            const Icon = ICON_MAP[currentAgent.icon || 'Bot'] || Bot;
            return <Icon size={14} color="white" />;
          })()}
        </div>
      )}

      <h1 className="text-[15px] font-bold tracking-[.2px] text-ink">
        {isSettingsPage ? 'Agent 设置' : currentSession?.title || APP_CONFIG.name}
      </h1>

      {!isSettingsPage && currentSession && <Chip tone="line">{formatModelName(currentSession.model)}</Chip>}

      <div className="flex-1" />

      <IconButton onClick={onToggleTheme} title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}>
        {theme === 'light' ? <MoonIcon /> : <SunnyIcon />}
      </IconButton>
      {!isSettingsPage && (
        <IconButton onClick={onRefreshModels} title="刷新模型列表">
          <RefreshIcon />
        </IconButton>
      )}
    </header>
  );
}
