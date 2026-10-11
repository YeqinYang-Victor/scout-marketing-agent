/**
 * Agent 模块入口：按子路由分发到会话页与设置页。
 *
 * 说明：会话界面基于 CodeBuddy Agent SDK 的 Web 脚手架，
 * 已统一到本项目的设计令牌（品牌色、圆角、字体）。
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import { useAgents } from '../hooks/useAgents';
import { useTheme } from '../hooks/useTheme';
import { useSessions } from '../hooks/useSessions';
import { useModels } from '../hooks/useModels';
import { useChat } from '../hooks/useChat';
import { PermissionMode } from '../types';

import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { SettingsPage } from '../components/SettingsPage';
import { ChatPage } from './ChatPage';

/**
 * Agent 对话页：把脚手架自带的「会话 + 聊天 + 设置」整体搬进 /agent 路由下，
 * 作为自然语言驱动流水线的入口（例如"帮我生成今天的侦察兵日报"）。
 */
export function AgentPage() {
  const navigate = useNavigate();
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const isSettingsPage = location.pathname === '/agent/settings';

  const { theme, toggleTheme } = useTheme();
  const { agents, addAgent, updateAgent, deleteAgent, getAgent } = useAgents();
  const { models, selectedModel, setSelectedModel, fetchModels } = useModels();
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    sessionModels,
    fetchSessions,
    deleteSession,
    updateSessionModel,
    addSession,
    updateSession,
    updateSessionMessages,
  } = useSessions();

  const {
    isLoading,
    inputValue,
    setInputValue,
    permissionRequest,
    sendMessage,
    handleStop,
    handlePermissionAllow,
    handlePermissionDeny,
  } = useChat({
    currentSession,
    currentSessionId,
    selectedModel,
    getAgent,
    addSession,
    updateSession,
    updateSessionMessages,
    updateSessionModel,
    setCurrentSessionId,
    setSessions,
  });

  const currentAgent = currentSession?.agentId ? getAgent(currentSession.agentId) : getAgent('default');

  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      setCurrentSessionId(urlSessionId);
    } else if (!urlSessionId && !isSettingsPage && currentSessionId) {
      setCurrentSessionId(null);
    }
  }, [urlSessionId, isSettingsPage, currentSessionId, setCurrentSessionId]);

  useEffect(() => {
    if (currentSessionId && sessionModels[currentSessionId]) {
      setSelectedModel(sessionModels[currentSessionId]);
    } else if (currentSession) {
      setSelectedModel(currentSession.model);
    }
  }, [currentSessionId, sessionModels, currentSession, setSelectedModel]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const updateCurrentSessionModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      if (currentSessionId) updateSessionModel(currentSessionId, modelId);
    },
    [currentSessionId, updateSessionModel, setSelectedModel],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const navigateTo = await deleteSession(sessionId);
      if (navigateTo) navigate('/agent');
    },
    [deleteSession, navigate],
  );

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    navigate('/agent');
  }, [navigate, setCurrentSessionId]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setCurrentSessionId(sessionId);
      navigate(`/agent/chat/${sessionId}`);
    },
    [navigate, setCurrentSessionId],
  );

  const handleOpenSettings = useCallback(() => navigate('/agent/settings'), [navigate]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');

  return (
    <div className="flex h-full w-full">
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        isSettingsPage={isSettingsPage}
        sidebarOpen={sidebarOpen}
        agents={agents}
        getAgent={getAgent}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={handleOpenSettings}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          isSettingsPage={isSettingsPage}
          sidebarOpen={sidebarOpen}
          theme={theme}
          currentSession={currentSession}
          currentAgent={currentAgent}
          models={models}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleTheme={toggleTheme}
          onRefreshModels={fetchModels}
        />

        {isSettingsPage ? (
          <SettingsPage agents={agents} onAdd={addAgent} onUpdate={updateAgent} onDelete={deleteAgent} />
        ) : (
          <ChatPage
            currentSession={currentSession}
            models={models}
            selectedModel={selectedModel}
            agents={agents}
            isLoading={isLoading}
            inputValue={inputValue}
            permissionRequest={permissionRequest}
            permissionMode={permissionMode}
            onSendMessage={sendMessage}
            onStop={handleStop}
            onInputChange={setInputValue}
            onModelChange={updateCurrentSessionModel}
            onPermissionAllow={handlePermissionAllow}
            onPermissionDeny={handlePermissionDeny}
            onPermissionModeChange={setPermissionMode}
          />
        )}
      </div>
    </div>
  );
}

export default AgentPage;
