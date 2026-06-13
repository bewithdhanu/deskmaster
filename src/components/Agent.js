import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MdSmartToy,
  MdAdd,
  MdDelete,
  MdSend,
  MdLibraryBooks,
  MdBuild,
  MdExtension,
  MdRefresh,
  MdTune,
  MdClose,
  MdContentCopy,
  MdNoteAdd,
  MdEdit,
  MdSearch
} from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';
import { getEnabledProviders, getProviderModel, PROVIDER_META, isProviderEnabled } from '../utils/agentProvidersClient';
import { getRoute, navigate, subscribe } from '../utils/appRoute';
import AgentMarkdown from './agent/AgentMarkdown';
import SaveToNotesDialog from './agent/SaveToNotesDialog';

const ipcRenderer = getIpcRenderer();

const CAPABILITY_META = {
  knowledgeBase: { label: 'Knowledge Base', icon: MdLibraryBooks, description: 'Search Notes and custom documents' },
  deskMasterTools: { label: 'DeskMaster Tools', icon: MdBuild, description: 'In-app tools (no clipboard/authenticator)' },
  composioIntegrations: { label: 'Integrations', icon: MdExtension, description: 'Connected Composio OAuth toolkits' }
};

const THINKING_MESSAGES = [
  'Thinking…',
  'Considering your request…',
  'Working on it…',
  'Gathering context…',
  'Almost there…'
];

function InputToolbarToggle({ id, enabled, onToggle, disabled }) {
  const meta = CAPABILITY_META[id];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(id, !enabled)}
      title={meta.description}
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        enabled
          ? 'bg-red-500/15 text-red-500'
          : 'text-theme-muted hover:bg-theme-secondary hover:text-theme-primary'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </button>
  );
}

const Agent = () => {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [settings, setSettings] = useState(null);
  const [capabilities, setCapabilities] = useState({
    knowledgeBase: false,
    deskMasterTools: false,
    composioIntegrations: false
  });
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [kbStatus, setKbStatus] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [citations, setCitations] = useState([]);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [composioToolkits, setComposioToolkits] = useState([]);
  const [connectingComposioSlug, setConnectingComposioSlug] = useState(null);
  const [saveToNotesState, setSaveToNotesState] = useState({ open: false, markdown: '', title: '' });
  const [copyFeedbackId, setCopyFeedbackId] = useState(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchResults, setChatSearchResults] = useState(null);
  const messagesEndRef = useRef(null);
  const streamBufferRef = useRef('');
  const integrationsRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const streamingSessionIdRef = useRef(null);
  const chatSearchQueryRef = useRef('');
  const loadChatSeqRef = useRef(0);
  const loadChatRef = useRef(null);
  const loadChatsRef = useRef(null);
  const resetDraftChatRef = useRef(null);
  const runChatSearchRef = useRef(null);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    chatSearchQueryRef.current = chatSearchQuery;
  }, [chatSearchQuery]);

  const enabledProviders = useMemo(
    () => (settings ? getEnabledProviders(settings) : []),
    [settings]
  );

  const displayMessages = useMemo(
    () => messages
      .map((msg, originalIndex) => ({ msg, originalIndex }))
      .filter(({ msg }) => {
        if (msg.role === 'tool') return false;
        if (msg.role === 'assistant' && msg.tool_calls?.length && !String(msg.content || '').trim()) {
          return false;
        }
        return msg.role === 'user' || msg.role === 'assistant';
      }),
    [messages]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, statusMessage, isStreaming, scrollToBottom]);

  useEffect(() => {
    if (!isStreaming || streamingText) return undefined;
    const interval = setInterval(() => {
      setThinkingIndex((i) => (i + 1) % THINKING_MESSAGES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [isStreaming, streamingText]);

  useEffect(() => {
    if (!showIntegrations) return undefined;
    const onDocClick = (e) => {
      if (integrationsRef.current && !integrationsRef.current.contains(e.target)) {
        setShowIntegrations(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showIntegrations]);

  const loadChats = async () => {
    try {
      const list = await ipcRenderer.invoke('agent:list-chats');
      setChats(list || []);
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  const runChatSearch = useCallback(async (query) => {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      setChatSearchResults(null);
      await loadChats();
      return;
    }
    try {
      const results = await ipcRenderer.invoke('agent:search-chats', trimmed);
      setChatSearchResults(results || []);
    } catch (error) {
      console.error('Error searching chats:', error);
      setChatSearchResults([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runChatSearch(chatSearchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [chatSearchQuery, runChatSearch]);

  const sidebarChats = chatSearchResults ?? chats;

  const hasUserMessages = useCallback(
    (msgs) => (msgs || []).some((m) => m.role === 'user'),
    []
  );

  const resetDraftChat = useCallback(() => {
    activeChatIdRef.current = null;
    streamingSessionIdRef.current = null;
    setActiveChatId(null);
    setMessages([]);
    setEditingMessageIndex(null);
    setEditDraft('');
    setCitations([]);
    setPendingConfirmation(null);
    setInput('');
    setIsStreaming(false);
    setStreamingText('');
    setStatusMessage('');
    streamBufferRef.current = '';
  }, []);

  const belongsToThisTab = useCallback((sessionId) => {
    if (!sessionId) return true;
    return (
      sessionId === activeChatIdRef.current ||
      sessionId === streamingSessionIdRef.current
    );
  }, []);

  const loadComposioToolkits = async () => {
    try {
      const toolkits = await ipcRenderer.invoke('agent:composio-list-toolkits');
      setComposioToolkits(toolkits || []);
    } catch {}
  };

  const applyProviderFromSettings = (s) => {
    const enabled = getEnabledProviders(s);
    const preferred = s?.agent?.defaultProvider;
    let nextProvider = provider;
    if (enabled.length > 0) {
      if (!enabled.includes(provider)) {
        nextProvider = enabled.includes(preferred) ? preferred : enabled[0];
      }
    }
    setProvider(nextProvider);
    const providerModel = getProviderModel(s, nextProvider);
    if (providerModel) setModel(providerModel);
  };

  const loadSettings = async () => {
    try {
      const s = await ipcRenderer.invoke('get-settings');
      setSettings(s);
      applyProviderFromSettings(s);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadKbStatus = async () => {
    try {
      const status = await ipcRenderer.invoke('agent:kb-status');
      setKbStatus(status);
    } catch {}
  };

  const loadChat = useCallback(async (sessionId, { force = false } = {}) => {
    if (!sessionId) {
      resetDraftChat();
      return;
    }

    if (!force && activeChatIdRef.current === sessionId) {
      return;
    }

    const seq = ++loadChatSeqRef.current;
    setIsStreaming(false);
    setStreamingText('');
    setStatusMessage('');
    streamBufferRef.current = '';

    try {
      const chat = await ipcRenderer.invoke('agent:get-chat', sessionId);
      if (seq !== loadChatSeqRef.current) return;

      if (chat) {
        activeChatIdRef.current = chat.id;
        streamingSessionIdRef.current = null;
        setActiveChatId(chat.id);
        setMessages(chat.messages || []);
        setEditingMessageIndex(null);
        setEditDraft('');
        if (chat.capabilities) setCapabilities(chat.capabilities);
        if (chat.provider && isProviderEnabled(settings, chat.provider)) {
          setProvider(chat.provider);
        }
        if (chat.model) setModel(chat.model);
      }
    } catch (error) {
      if (seq !== loadChatSeqRef.current) return;
      console.error('Error loading chat:', error);
    }
  }, [resetDraftChat, settings]);

  const selectChat = useCallback((sessionId) => {
    if (!sessionId || sessionId === activeChatIdRef.current) return;
    navigate({ tab: 'agent', chatId: sessionId }, { replace: true });
  }, []);

  const openDraftChat = useCallback(() => {
    resetDraftChat();
    navigate({ tab: 'agent' }, { replace: true });
  }, [resetDraftChat]);

  const belongsToThisTabRef = useRef(belongsToThisTab);
  belongsToThisTabRef.current = belongsToThisTab;

  loadChatRef.current = loadChat;
  loadChatsRef.current = loadChats;
  resetDraftChatRef.current = resetDraftChat;
  runChatSearchRef.current = runChatSearch;

  useEffect(() => {
    loadChats();
    loadSettings();
    loadKbStatus();
    loadComposioToolkits();

    const initialRoute = getRoute();
    if (initialRoute.tab === 'agent' && initialRoute.chatId) {
      loadChat(initialRoute.chatId, { force: true });
    }

    const handleStream = (event, payload) => {
      if (!payload) return;
      if (payload.sessionId && !belongsToThisTabRef.current(payload.sessionId)) return;

      if (payload.type === 'status') {
        setStatusMessage(payload.message || '');
      }

      if (payload.type === 'token') {
        streamBufferRef.current += payload.content || '';
        setStreamingText(streamBufferRef.current);
        setStatusMessage('');
      }

      if (payload.type === 'kb_citations') {
        setCitations(payload.citations || []);
      }

      if (payload.type === 'tool_start') {
        setStatusMessage(`Using ${payload.name || 'tool'}…`);
      }

      if (payload.type === 'confirmation_required') {
        setPendingConfirmation(payload);
        setIsStreaming(false);
        setStatusMessage('');
      }

      if (payload.type === 'done') {
        setIsStreaming(false);
        setStatusMessage('');
        streamBufferRef.current = '';
        setStreamingText('');
        streamingSessionIdRef.current = null;
        if (payload.sessionId) {
          activeChatIdRef.current = payload.sessionId;
          setActiveChatId(payload.sessionId);
          navigate({ tab: 'agent', chatId: payload.sessionId }, { replace: true });
          void loadChatRef.current?.(payload.sessionId, { force: true });
          void loadChatsRef.current?.();
        }
      }

      if (payload.type === 'title_updated') {
        void loadChatsRef.current?.();
        const query = chatSearchQueryRef.current.trim();
        if (query) {
          void runChatSearchRef.current?.(query);
        }
      }

      if (payload.type === 'error') {
        setIsStreaming(false);
        setStatusMessage('');
        streamBufferRef.current = '';
        setStreamingText('');
        streamingSessionIdRef.current = null;
      }
    };

    ipcRenderer.on('agent:stream', handleStream);
    return () => {
      ipcRenderer.removeListener('agent:stream', handleStream);
    };
  }, []);

  useEffect(() => {
    return subscribe(() => {
      const route = getRoute();
      if (route.tab !== 'agent') return;

      const routeChatId = route.chatId || null;
      if (routeChatId === activeChatIdRef.current) return;

      if (routeChatId) {
        void loadChatRef.current?.(routeChatId, { force: true });
      } else {
        resetDraftChatRef.current?.();
      }
    });
  }, []);

  useEffect(() => {
    const onSettingsUpdate = (event, newSettings) => {
      setSettings(newSettings);
      applyProviderFromSettings(newSettings);
    };
    ipcRenderer.on('settings-updated', onSettingsUpdate);
    return () => ipcRenderer.removeListener('settings-updated', onSettingsUpdate);
  }, [provider]);

  const handleNewChat = async () => {
    const defaultCaps = {
      knowledgeBase: false,
      deskMasterTools: false,
      composioIntegrations: false
    };

    if (!hasUserMessages(messages)) {
      if (activeChatId) {
        try {
          await ipcRenderer.invoke('agent:delete-chat', activeChatId);
          await loadChats();
          if (chatSearchQuery.trim()) {
            await runChatSearch(chatSearchQuery);
          }
        } catch (error) {
          console.error('Error removing empty chat:', error);
        }
      }
      setCapabilities(defaultCaps);
      openDraftChat();
      return;
    }

    setCapabilities(defaultCaps);
    openDraftChat();
  };

  const handleDeleteChat = async (sessionId, e) => {
    e.stopPropagation();
    try {
      await ipcRenderer.invoke('agent:delete-chat', sessionId);
      if (activeChatId === sessionId) {
        openDraftChat();
      }
      await loadChats();
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const persistCapabilities = async (next) => {
    if (activeChatId) {
      try {
        await ipcRenderer.invoke('agent:update-chat', { sessionId: activeChatId, capabilities: next });
      } catch (error) {
        console.error('Error saving capability toggle:', error);
      }
    }
  };

  const toggleCapability = async (key, value) => {
    const next = { ...capabilities, [key]: value };
    setCapabilities(next);
    await persistCapabilities(next);
  };

  const persistProviderModel = async (nextProvider, nextModel) => {
    if (activeChatId) {
      try {
        await ipcRenderer.invoke('agent:update-chat', {
          sessionId: activeChatId,
          provider: nextProvider,
          model: nextModel
        });
      } catch (error) {
        console.error('Error saving provider/model:', error);
      }
    }
  };

  const handleProviderChange = (nextProvider) => {
    setProvider(nextProvider);
    const nextModel = getProviderModel(settings, nextProvider);
    setModel(nextModel);
    persistProviderModel(nextProvider, nextModel);
  };

  const sendMessage = async (text, confirmedToolIds = []) => {
    if (!text.trim() || isStreaming) return;
    if (enabledProviders.length === 0) {
      alert('Enable and configure at least one LLM provider in Settings > AI Agent.');
      return;
    }

    const capsForTurn = { ...capabilities };
    const userMessage = text.trim();
    setInput('');
    setIsStreaming(true);
    setStreamingText('');
    setStatusMessage('Thinking…');
    setThinkingIndex(0);
    streamBufferRef.current = '';
    setCitations([]);
    setPendingConfirmation(null);

    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: new Date().toISOString() }]);

    try {
      let sessionId = activeChatId;
      if (!sessionId) {
        const created = await ipcRenderer.invoke('agent:create-chat', {
          capabilities: capsForTurn,
          provider,
          model: model || undefined
        });
        if (!created?.id) throw new Error('Failed to create chat session');
        sessionId = created.id;
        activeChatIdRef.current = sessionId;
        streamingSessionIdRef.current = sessionId;
        setActiveChatId(sessionId);
        navigate({ tab: 'agent', chatId: sessionId }, { replace: true });
      } else {
        streamingSessionIdRef.current = sessionId;
      }

      const result = await ipcRenderer.invoke('agent:chat', {
        sessionId,
        message: userMessage,
        capabilities: capsForTurn,
        provider,
        model: model || undefined,
        confirmedToolIds
      });

      const resolvedSessionId = result?.sessionId || sessionId;
      if (resolvedSessionId) {
        setActiveChatId(resolvedSessionId);
        try {
          const chat = await ipcRenderer.invoke('agent:get-chat', resolvedSessionId);
          if (chat?.messages?.length) {
            setMessages(chat.messages);
            setCapabilities(chat.capabilities || capsForTurn);
            if (chat.provider) setProvider(chat.provider);
            if (chat.model) setModel(chat.model);
          } else if (result?.message) {
            setMessages((prev) => [...prev, result.message]);
            setCapabilities(capsForTurn);
          }
        } catch {
          if (result?.message) {
            setMessages((prev) => [...prev, result.message]);
          }
        }
        await loadChats();
      } else if (result?.message) {
        setMessages((prev) => [...prev, result.message]);
      }

      if (result?.requiresConfirmation) {
        setPendingConfirmation(result.message?.pendingConfirmation || result);
      }

      setIsStreaming(false);
      setStatusMessage('');
      streamBufferRef.current = '';
      setStreamingText('');
      streamingSessionIdRef.current = null;
    } catch (error) {
      setIsStreaming(false);
      setStatusMessage('');
      streamingSessionIdRef.current = null;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${error.message || 'Failed to get response'}`, timestamp: new Date().toISOString(), isError: true }
      ]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const confirmPendingTool = () => {
    if (!pendingConfirmation) return;
    const toolId = pendingConfirmation.toolCallId || pendingConfirmation.id;
    sendMessage('Yes, proceed with the tool call.', [toolId]);
  };

  const handleReindexKb = async () => {
    try {
      await ipcRenderer.invoke('agent:kb-reindex');
      await loadKbStatus();
    } catch (error) {
      alert(`Reindex failed: ${error.message}`);
    }
  };

  const connectComposioToolkit = async (slug) => {
    if (connectingComposioSlug === slug) return;
    if (connectingComposioSlug) {
      await cancelComposioConnection(connectingComposioSlug);
    }
    setConnectingComposioSlug(slug);
    try {
      const result = await ipcRenderer.invoke('agent:composio-connect', slug);
      await ipcRenderer.invoke('agent:composio-wait', {
        toolkitSlug: slug,
        knownAccountIds: result?.knownAccountIds || [],
        connectionRequestId: result?.connectionRequestId || null
      });
      await loadComposioToolkits();
      if (!capabilities.composioIntegrations) {
        const next = { ...capabilities, composioIntegrations: true };
        setCapabilities(next);
        await persistCapabilities(next);
      }
    } catch (error) {
      if (error?.message !== 'Connection cancelled') {
        alert(`Connect failed: ${error.message}`);
      }
    } finally {
      setConnectingComposioSlug((current) => (current === slug ? null : current));
    }
  };

  const cancelComposioConnection = async (slug) => {
    try {
      await ipcRenderer.invoke('agent:composio-cancel-wait', slug);
    } catch (error) {
      console.warn('Cancel Composio connection:', error.message);
    }
    setConnectingComposioSlug((current) => (current === slug ? null : current));
  };

  const titleFromContent = (content) => {
    const text = String(content || '').trim();
    if (!text) return 'Agent response';
    const firstLine = text.split('\n').find((line) => line.trim()) || '';
    const stripped = firstLine.replace(/^#+\s*/, '').trim();
    return stripped.slice(0, 80) || 'Agent response';
  };

  const copyMessageContent = async (content, messageKey) => {
    const text = String(content || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedbackId(messageKey);
      setTimeout(() => setCopyFeedbackId((id) => (id === messageKey ? null : id)), 1500);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const openSaveToNotes = (content) => {
    const markdown = String(content || '').trim();
    if (!markdown) return;
    setSaveToNotesState({
      open: true,
      markdown,
      title: titleFromContent(markdown)
    });
  };

  const startEditMessage = (originalIndex, content) => {
    if (isStreaming) return;
    setEditingMessageIndex(originalIndex);
    setEditDraft(String(content || ''));
  };

  const cancelEditMessage = () => {
    setEditingMessageIndex(null);
    setEditDraft('');
  };

  const submitEditMessage = async () => {
    const newText = editDraft.trim();
    if (!newText || editingMessageIndex === null || isStreaming) return;
    if (!activeChatId) {
      alert('Start a chat before editing messages.');
      return;
    }

    const truncated = messages.slice(0, editingMessageIndex);
    setEditingMessageIndex(null);
    setEditDraft('');
    setPendingConfirmation(null);
    setCitations([]);

    try {
      await ipcRenderer.invoke('agent:replace-messages', {
        sessionId: activeChatId,
        messages: truncated
      });
      setMessages(truncated);
      await sendMessage(newText);
    } catch (error) {
      alert(`Failed to edit message: ${error.message}`);
    }
  };

  const renderMessage = ({ msg, originalIndex }) => {
    const isUser = msg.role === 'user';
    const isError = msg.isError;
    const content = String(msg.content || '').trim();
    const messageKey = `${originalIndex}-${msg.timestamp || originalIndex}`;
    const isEditing = isUser && editingMessageIndex === originalIndex;
    const showAssistantActions = !isUser && content.length > 0;

    if (isUser && isEditing) {
      return (
        <div key={messageKey} className="mb-3 flex justify-end">
          <div className="max-w-[85%] rounded-xl border border-red-500/40 bg-theme-card px-4 py-3 text-sm">
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-theme bg-theme-secondary px-3 py-2 text-sm text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitEditMessage();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEditMessage();
                }
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary text-xs" onClick={cancelEditMessage}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary text-xs"
                onClick={submitEditMessage}
                disabled={!editDraft.trim()}
              >
                Save & resend
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={messageKey} className={`group flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
        <div
          className={`relative max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-red-500 text-white'
              : isError
                ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                : 'border border-theme bg-theme-card text-theme-primary'
          }`}
        >
          {!isUser && (
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">
              <MdSmartToy className="h-3 w-3" /> Agent
            </div>
          )}
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <AgentMarkdown content={content} className={isError ? 'text-red-400' : ''} />
          )}
          {isUser && content && !isStreaming && (
            <div className="mt-2 flex items-center gap-1 border-t border-white/20 pt-2">
              <button
                type="button"
                onClick={() => startEditMessage(originalIndex, content)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                title="Edit message"
              >
                <MdEdit className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
          )}
          {showAssistantActions && (
            <div className="mt-2 flex items-center gap-1 border-t border-theme pt-2">
              <button
                type="button"
                onClick={() => copyMessageContent(content, messageKey)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-theme-muted transition-colors hover:bg-theme-secondary hover:text-theme-primary"
                title="Copy markdown"
              >
                <MdContentCopy className="h-3.5 w-3.5" />
                {copyFeedbackId === messageKey ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={() => openSaveToNotes(content)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-theme-muted transition-colors hover:bg-theme-secondary hover:text-theme-primary"
                title="Save to Notes"
              >
                <MdNoteAdd className="h-3.5 w-3.5" />
                Save to Notes
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const thinkingLabel = statusMessage || THINKING_MESSAGES[thinkingIndex];
  const noProviders = enabledProviders.length === 0;

  return (
    <div className="flex h-full bg-theme-primary">
      <aside className="flex w-56 shrink-0 flex-col border-r border-theme bg-theme-card/50">
        <div className="border-b border-theme p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="btn btn-primary flex w-full items-center justify-center gap-2 text-sm"
          >
            <MdAdd className="h-4 w-4" /> New Chat
          </button>
          <div className="relative mt-2">
            <MdSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-theme-muted" />
            <input
              type="search"
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full rounded-lg border border-theme bg-theme-secondary py-1.5 pl-8 pr-2 text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sidebarChats.map((chat) => (
            <button
              type="button"
              key={chat.id}
              onClick={() => selectChat(chat.id)}
              className={`group mb-1 flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                activeChatId === chat.id ? 'bg-red-500/10 text-red-500' : 'text-theme-muted hover:bg-theme-secondary hover:text-theme-primary'
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{chat.title || 'Untitled'}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDeleteChat(chat.id, e)}
                  className="hidden shrink-0 text-theme-muted hover:text-red-500 group-hover:block"
                >
                  <MdDelete className="h-3.5 w-3.5" />
                </span>
              </span>
              {chat.matchSnippet && (
                <span className="mt-1 truncate text-[10px] text-theme-muted">{chat.matchSnippet}</span>
              )}
            </button>
          ))}
          {!sidebarChats.length && (
            <p className="px-2 py-4 text-center text-xs text-theme-muted">
              {chatSearchQuery.trim() ? 'No matching conversations' : 'No conversations yet'}
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {citations.length > 0 && (
          <div className="border-b border-theme bg-theme-secondary/40 px-4 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-theme-muted mb-1">Sources</div>
            <div className="flex flex-wrap gap-1">
              {citations.map((c, i) => (
                <span key={i} className="rounded-full border border-theme bg-theme-card px-2 py-0.5 text-[10px] text-theme-muted">
                  {c.title}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!messages.length && !isStreaming && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MdSmartToy className="mb-3 h-12 w-12 text-theme-muted" />
              <h2 className="text-lg font-semibold text-theme-primary">DeskMaster Agent</h2>
              <p className="mt-2 max-w-md text-sm text-theme-muted">
                Simple AI chat by default. Use the toolbar below to enable Knowledge Base, tools, integrations, or change model.
              </p>
              {noProviders && (
                <p className="mt-3 text-sm text-red-400">
                  No LLM providers enabled. Open Settings → AI Agent to configure providers.
                </p>
              )}
            </div>
          )}

          {displayMessages.map((entry) => renderMessage(entry))}

          {isStreaming && !streamingText && (
            <div className="mb-3 flex justify-start">
              <div className="max-w-[85%] rounded-xl border border-theme bg-theme-card px-4 py-3 text-sm text-theme-muted">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">
                  <MdSmartToy className="h-3 w-3" /> Agent
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                  <span className="animate-pulse">{thinkingLabel}</span>
                </div>
              </div>
            </div>
          )}

          {streamingText && (
            <div className="mb-3 flex justify-start">
              <div className="max-w-[85%] rounded-xl border border-theme bg-theme-card px-4 py-2.5 text-sm text-theme-primary">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">
                  <MdSmartToy className="h-3 w-3" /> Agent
                </div>
                <AgentMarkdown content={streamingText} />
                <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-red-500" />
              </div>
            </div>
          )}

          {pendingConfirmation && (
            <div className="mb-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
              <p className="text-theme-primary">This action requires your confirmation.</p>
              <button type="button" onClick={confirmPendingTool} className="btn btn-primary mt-2 text-xs">
                Confirm and proceed
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-theme bg-theme-card/50 p-4">
          <form onSubmit={handleSubmit}>
            <div className="rounded-xl border border-theme bg-theme-secondary focus-within:ring-2 focus-within:ring-red-500/40">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder={noProviders ? 'Enable a provider in Settings to chat…' : 'Message DeskMaster Agent…'}
                rows={2}
                disabled={isStreaming || noProviders}
                className="w-full resize-none bg-transparent px-4 py-3 text-sm text-theme-primary placeholder:text-theme-muted focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-1 border-t border-theme px-2 py-1.5">
                {Object.keys(CAPABILITY_META).map((key) => (
                  <InputToolbarToggle
                    key={key}
                    id={key}
                    enabled={capabilities[key]}
                    onToggle={toggleCapability}
                    disabled={isStreaming}
                  />
                ))}

                {capabilities.knowledgeBase && (
                  <button
                    type="button"
                    onClick={handleReindexKb}
                    title={`KB: ${kbStatus?.documents || 0} docs, ${kbStatus?.chunks || 0} chunks`}
                    disabled={isStreaming}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-theme-muted hover:bg-theme-card hover:text-theme-primary disabled:opacity-50"
                  >
                    <MdRefresh className="h-3.5 w-3.5" />
                  </button>
                )}

                <div className="relative ml-1" ref={integrationsRef}>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={() => setShowIntegrations((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                      showIntegrations ? 'bg-theme-card text-theme-primary' : 'text-theme-muted hover:bg-theme-card hover:text-theme-primary'
                    }`}
                  >
                    <MdTune className="h-3.5 w-3.5" />
                    Connect apps
                  </button>
                  {showIntegrations && (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-theme bg-theme-primary p-3 shadow-xl">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-theme-primary">Composio integrations</span>
                        <button type="button" onClick={() => setShowIntegrations(false)} className="text-theme-muted hover:text-theme-primary">
                          <MdClose className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mb-2 text-[10px] text-theme-muted">Connect OAuth apps for the agent. Complete authorization in the popup window. You can connect multiple accounts per app.</p>
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {composioToolkits.map((t) => (
                          <div key={t.slug} className="rounded-lg border border-theme/60 bg-theme-secondary/30 p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-theme-primary">{t.name}</span>
                              {connectingComposioSlug === t.slug ? (
                                <button
                                  type="button"
                                  onClick={() => cancelComposioConnection(t.slug)}
                                  className="text-[10px] text-theme-muted hover:text-theme-primary inline-flex items-center gap-1"
                                >
                                  <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => connectComposioToolkit(t.slug)}
                                  className="text-[10px] text-red-500 hover:text-red-400"
                                >
                                  {t.accounts?.length ? '+ Add' : 'Connect'}
                                </button>
                              )}
                            </div>
                            {t.accounts?.length > 0 ? (
                              <div className="space-y-1">
                                {t.accounts.map((account) => (
                                  <div key={account.id} className="truncate text-[10px] text-green-500" title={account.label}>
                                    {account.label}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-theme-muted">Not connected</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {enabledProviders.length > 0 && (
                    <select
                      value={provider}
                      onChange={(e) => handleProviderChange(e.target.value)}
                      disabled={isStreaming}
                      className="rounded-lg border border-theme bg-theme-card px-2 py-1.5 text-xs text-theme-primary"
                      title="Model provider"
                    >
                      {enabledProviders.map((id) => (
                        <option key={id} value={id}>{PROVIDER_META[id]?.label || id}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      persistProviderModel(provider, e.target.value);
                    }}
                    disabled={isStreaming || !enabledProviders.length}
                    placeholder="Model"
                    className="w-28 rounded-lg border border-theme bg-theme-card px-2 py-1.5 text-xs text-theme-primary font-mono"
                    title="Model name"
                  />
                  <button
                    type="submit"
                    disabled={isStreaming || !input.trim() || noProviders}
                    className="btn btn-primary flex h-9 w-9 items-center justify-center p-0"
                  >
                    <MdSend className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      <SaveToNotesDialog
        open={saveToNotesState.open}
        markdown={saveToNotesState.markdown}
        defaultTitle={saveToNotesState.title}
        onClose={() => setSaveToNotesState({ open: false, markdown: '', title: '' })}
        onSaved={() => {}}
      />
    </div>
  );
};

export default Agent;
