/**
 * 会话侧栏：会话列表、搜索、重命名与删除。
 */
import { Tooltip } from 'tdesign-react';
import { AddIcon, DeleteIcon, SettingIcon } from 'tdesign-icons-react';
import { Bot } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Session, Agent } from '../types';
import { ICON_MAP } from '../utils/iconMap';
import { SmallButton } from './scout/atoms';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  isSettingsPage: boolean;
  sidebarOpen: boolean;
  agents: Agent[];
  getAgent: (id: string) => Agent | undefined;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  sessions,
  currentSessionId,
  isSettingsPage,
  sidebarOpen,
  getAgent,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside
      className="flex flex-col shrink-0 transition-all duration-300 overflow-hidden bg-white border-r border-hairline"
      style={{ width: sidebarOpen ? 260 : 0 }}
    >
      {/* 品牌区（与左侧主导航的品牌区同一套写法） */}
      <div className="h-[62px] px-4 flex items-center shrink-0 border-b border-hairline-soft">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0 bg-gradient-to-br from-[#D4000E] to-brand-dark shadow-[0_4px_12px_-4px_rgba(199,0,11,.55)]">
            <span className="text-white text-[13px] font-bold">{APP_CONFIG.nameInitial}</span>
          </div>
          <span className="text-[14px] font-bold text-ink truncate">{APP_CONFIG.name}</span>
        </div>
      </div>

      {/* 新对话 */}
      <div className="p-3">
        <SmallButton onClick={onNewChat} className="w-full justify-center !py-2.5">
          <AddIcon size={14} /> 新对话
        </SmallButton>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {sessions.map((session) => {
          const sessionAgent = session.agentId ? getAgent(session.agentId) : getAgent('default');
          const AgentIcon = ICON_MAP[sessionAgent?.icon || 'Bot'] || Bot;
          const active = session.id === currentSessionId && !isSettingsPage;
          return (
            <div
              key={session.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer transition-colors group ${
                active ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-hairline-soft'
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <div
                className="shrink-0 w-5 h-5 rounded grid place-items-center"
                style={{ backgroundColor: sessionAgent?.color || '#C7000B' }}
              >
                <AgentIcon size={12} color="white" />
              </div>
              <span className="flex-1 truncate text-[13px]">{session.title}</span>
              <Tooltip content="删除会话">
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center w-6 h-6 rounded-md border-0 bg-transparent text-ink-mute hover:text-[#D93025] hover:bg-white/70"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                >
                  <DeleteIcon size={14} />
                </button>
              </Tooltip>
            </div>
          );
        })}
        {sessions.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-ink-faint">还没有会话</p>
        )}
      </div>

      {/* 底部设置 */}
      <div className="p-3 border-t border-hairline-soft shrink-0">
        <button
          onClick={onOpenSettings}
          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${
            isSettingsPage
              ? 'bg-brand-soft text-brand border border-brand'
              : 'text-ink-soft border border-hairline hover:border-ink-faint hover:text-ink'
          }`}
        >
          <SettingIcon size={14} /> 设置
        </button>
      </div>
    </aside>
  );
}
