/**
 * 应用外壳：路由表 + 响应式导航。
 * 桌面端为左侧导航栏，移动端（<1024px）自动切换为底部标签栏。
 */
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  SlidersHorizontal,
  FileText,
  MessageSquare,
  Radar,
} from 'lucide-react';
import '@tdesign-react/chat/es/style/index.js';

import { APP_CONFIG } from './config';
import { ScoutDashboard } from './pages/ScoutDashboard';
import { SourcesPage } from './pages/SourcesPage';
import { RulesPage } from './pages/RulesPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { AgentPage } from './pages/AgentPage';

const NAV = [
  { path: '/', label: '今日工作台', short: '工作台', desc: '一键生成日报', icon: LayoutDashboard, end: true },
  { path: '/sources', label: '数据源配置', short: '数据源', desc: '订阅站点 / 账号密码', icon: Database },
  { path: '/rules', label: '筛选规则', short: '规则', desc: '五维打分模型', icon: SlidersHorizontal },
  { path: '/templates', label: '文案模板', short: '模板', desc: '文案库与合规结构', icon: FileText },
  { path: '/agent', label: 'Agent 对话', short: '对话', desc: '自然语言驱动', icon: MessageSquare },
];

/** 桌面端：左侧导航栏 */
function NavRail() {
  const location = useLocation();

  return (
    <aside className="hidden lg:flex w-[228px] shrink-0 flex-col border-r border-hairline bg-white">
      <div className="px-5 pt-[22px] pb-[18px] flex items-center gap-3">
        <div className="w-[38px] h-[38px] shrink-0 rounded-[11px] grid place-items-center text-white bg-gradient-to-br from-[#D4000E] to-brand-dark shadow-[0_4px_12px_-4px_rgba(199,0,11,.55)]">
          <Radar size={20} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <b className="block text-[14.5px] tracking-[.2px] leading-tight text-ink">{APP_CONFIG.name}</b>
          <span className="block text-[10.5px] mt-0.5 tracking-[.2px] text-ink-mute">营销文案自动化生产</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-1.5 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className="relative flex items-start gap-3 px-3 py-2.5 rounded-[10px] transition-colors"
              style={{
                backgroundColor: active ? 'rgba(199,0,11,0.07)' : 'transparent',
                color: active ? '#C7000B' : '#14224A',
              }}
            >
              {active && (
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-[3px] bg-brand" />
              )}
              <Icon size={17} className="mt-0.5 shrink-0" strokeWidth={active ? 2.4 : 2} />
              <span className="min-w-0">
                <b className="block text-[13px] font-semibold leading-tight">{item.label}</b>
                <em className="block not-italic text-[10.5px] mt-0.5 text-ink-mute">{item.desc}</em>
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-[10.5px] text-ink-faint border-t border-hairline-soft">
        v{APP_CONFIG.version} · 个人项目
      </div>
    </aside>
  );
}

/** 移动端：底部标签栏 */
function TabBar() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex bg-white/96 backdrop-blur border-t border-hairline pt-[7px] pb-[9px]">
      {NAV.map((item) => {
        const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className="flex-1 grid justify-items-center gap-[3px] py-[3px] text-[10px] no-underline"
            style={{ color: active ? '#C7000B' : '#B4BBCB', fontWeight: active ? 600 : 400 }}
          >
            <Icon size={19} strokeWidth={active ? 2.4 : 2} />
            {item.short}
          </NavLink>
        );
      })}
    </nav>
  );
}

function App() {
  return (
    <div className="flex h-screen w-screen bg-[#F4F6FA]">
      <NavRail />
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<ScoutDashboard />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/agent/chat/:sessionId" element={<AgentPage />} />
          <Route path="/agent/settings" element={<AgentPage />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}

export default App;
