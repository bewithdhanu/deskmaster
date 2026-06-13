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
  MdSearch,
  MdAttachFile,
  MdDownload,
  MdCheck,
  MdArrowDropDown
} from 'react-icons/md';
import { getIpcRenderer, isElectron } from '../utils/electron';
import { getEnabledProviders, getProviderModel, PROVIDER_META, isProviderEnabled } from '../utils/agentProvidersClient';
import { getRoute, navigate, subscribe } from '../utils/appRoute';
import { readAttachmentFiles, MAX_CHAT_ATTACHMENTS } from '../utils/agentFileUpload';
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

function CapabilityMenuItem({ id, enabled, onToggle, disabled }) {
  const meta = CAPABILITY_META[id];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(id, !enabled)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-theme-primary transition-colors hover:bg-theme-secondary disabled:opacity-50"
    >
      <Icon className="h-4 w-4 shrink-0 text-theme-muted" />
      <span className="flex-1">{meta.label}</span>
      {enabled && <MdCheck className="h-4 w-4 shrink-0 text-red-500" />}
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
  const [isReindexingKb, setIsReindexingKb] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [streamingCitations, setStreamingCitations] = useState([]);
  const [showInputMenu, setShowInputMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [composioToolkits, setComposioToolkits] = useState([]);
  const [connectingComposioSlug, setConnectingComposioSlug] = useState(null);
  const [saveToNotesState, setSaveToNotesState] = useState({ open: false, markdown: '', title: '' });
  const [copyFeedbackId, setCopyFeedbackId] = useState(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [streamingAttachments, setStreamingAttachments] = useState([]);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchResults, setChatSearchResults] = useState(null);
  const messagesEndRef = useRef(null);
  const streamBufferRef = useRef('');
  const activeChatIdRef = useRef(null);
  const streamingSessionIdRef = useRef(null);
  const chatSearchQueryRef = useRef('');
  const loadChatSeqRef = useRef(0);
  const loadChatRef = useRef(null);
  const loadChatsRef = useRef(null);
  const resetDraftChatRef = useRef(null);
  const runChatSearchRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputMenuRef = useRef(null);
  const modelMenuRef = useRef(null);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputMenuRef.current && !inputMenuRef.current.contains(event.target)) {
        setShowInputMenu(false);
        setShowIntegrations(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const enabledCapabilityCount = useMemo(
    () => Object.values(capabilities).filter(Boolean).length,
    [capabilities]
  );

  const modelLabel = useMemo(() => {
    const modelName = model || getProviderModel(settings, provider) || 'default';
    return modelName;
  }, [model, provider, settings]);

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
    setStreamingCitations([]);
    setPendingConfirmation(null);
    setInput('');
    setPendingAttachments([]);
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

      if (payload.type === 'media' && payload.attachment) {
        setStreamingAttachments((prev) => {
          const key = payload.attachment.dataUrl || payload.attachment.url;
          if (!key || prev.some((item) => (item.dataUrl || item.url) === key)) return prev;
          return [...prev, payload.attachment];
        });
      }

      if (payload.type === 'generated_file' && payload.file?.name) {
        setGeneratedFiles((prev) => {
          if (prev.some((item) => item.name === payload.file.name)) return prev;
          return [...prev, payload.file];
        });
      }

      if (payload.type === 'kb_citations') {
        setStreamingCitations(payload.citations || []);
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
        setStreamingAttachments([]);
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
        setStreamingCitations([]);
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

  const splitAttachmentsForSend = (attachments) => {
    const images = []
    const files = []
    for (const item of attachments || []) {
      if (item?.dataUrl) {
        images.push({ name: item.name, mediaType: item.mediaType, dataUrl: item.dataUrl })
      } else if (item?.extractedText) {
        files.push({
          kind: 'document',
          name: item.name,
          mediaType: item.mediaType,
          extractedText: item.extractedText,
          size: item.size
        })
      }
    }
    return { images, files }
  }

  const handleFileSelect = async (event) => {
    const { files } = event.target;
    if (!files?.length || isStreaming) return;

    try {
      const attachments = await readAttachmentFiles(files, pendingAttachments.length, ipcRenderer);
      if (attachments.length) {
        setPendingAttachments((prev) => [...prev, ...attachments].slice(0, MAX_CHAT_ATTACHMENTS));
      }
    } catch (error) {
      alert(error.message || 'Failed to attach file');
    } finally {
      event.target.value = '';
    }
  };

  const handleAttachFiles = async () => {
    if (isStreaming || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS) return;

    if (isElectron()) {
      try {
        const attachments = await ipcRenderer.invoke('agent:pick-images', {
          existingCount: pendingAttachments.length
        });
        if (attachments?.length) {
          setPendingAttachments((prev) => [...prev, ...attachments].slice(0, MAX_CHAT_ATTACHMENTS));
        }
      } catch (error) {
        alert(error.message || 'Failed to attach file');
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const removePendingAttachment = (index) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const openGeneratedFile = async (fileName) => {
    if (!fileName) return;
    try {
      await ipcRenderer.invoke('agent:open-generated-file', fileName);
    } catch (error) {
      alert(error.message || 'Could not open file');
    }
  };

  const sendMessage = async (text, confirmedToolIds = [], attachmentsOverride = null) => {
    const attachmentsToSend = attachmentsOverride ?? pendingAttachments;
    const { images: imagesToSend, files: filesToSend } = splitAttachmentsForSend(attachmentsToSend);
    const userMessage = text.trim();
    if ((!userMessage && !imagesToSend.length && !filesToSend.length) || isStreaming) return;
    if (enabledProviders.length === 0) {
      alert('Enable and configure at least one LLM provider in Settings > AI Agent.');
      return;
    }

    const capsForTurn = { ...capabilities };
    setInput('');
    setPendingAttachments([]);
    setGeneratedFiles([]);
    setStreamingAttachments([]);
    setStreamingCitations([]);
    setIsStreaming(true);
    setStreamingText('');
    setStatusMessage('Thinking…');
    setThinkingIndex(0);
    streamBufferRef.current = '';
    setStreamingCitations([]);
    setPendingConfirmation(null);

    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userMessage,
        ...(imagesToSend.length ? { images: imagesToSend } : {}),
        ...(filesToSend.length ? { files: filesToSend } : {}),
        timestamp: new Date().toISOString()
      }
    ]);

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
        ...(imagesToSend.length ? { images: imagesToSend } : {}),
        ...(filesToSend.length ? { files: filesToSend } : {}),
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
    if (isReindexingKb) return;
    setIsReindexingKb(true);
    setShowInputMenu(true);
    try {
      await ipcRenderer.invoke('agent:kb-reindex');
      await loadKbStatus();
    } catch (error) {
      alert(`Reindex failed: ${error.message}`);
    } finally {
      setIsReindexingKb(false);
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
    setStreamingCitations([]);

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

  const renderMessageFiles = (files) => {
    if (!Array.isArray(files) || !files.length) return null;
    return (
      <div className="mb-2 flex flex-wrap gap-2">
        {files.map((file, idx) => (
          <div
            key={`${file.name || 'file'}-${idx}`}
            className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[11px]"
            title={file.extractedText ? file.extractedText.slice(0, 500) : file.name}
          >
            <MdAttachFile className="h-3.5 w-3.5" />
            <span className="max-w-[10rem] truncate">{file.name || `Document ${idx + 1}`}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderAssistantMedia = (attachments) => {
    if (!Array.isArray(attachments) || !attachments.length) return null;
    return (
      <div className="mb-2 flex flex-wrap gap-2">
        {attachments.map((item, idx) => {
          if (item.kind === 'video' && (item.url || item.dataUrl)) {
            const src = item.url || item.dataUrl;
            return (
              <video
                key={`${item.name || 'video'}-${idx}`}
                src={src}
                controls
                className="max-h-56 max-w-full rounded-lg border border-theme"
              />
            );
          }
          if (item.path && item.name) {
            return (
              <button
                key={`${item.name}-${idx}`}
                type="button"
                onClick={() => openGeneratedFile(item.name)}
                className="inline-flex items-center gap-1 rounded-lg border border-theme bg-theme-secondary px-2 py-1 text-[11px] text-theme-primary hover:bg-theme-card"
              >
                <MdDownload className="h-3.5 w-3.5" />
                {item.name}
              </button>
            );
          }
          const src = item.dataUrl || item.url;
          if (!src) return null;
          return (
            <a
              key={`${item.name || 'media'}-${idx}`}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-theme"
            >
              <img src={src} alt={item.name || `Media ${idx + 1}`} className="max-h-56 max-w-full object-contain" />
            </a>
          );
        })}
      </div>
    );
  };

  const renderMessageSources = (sources) => {
    if (!Array.isArray(sources) || !sources.length) return null;
    return (
      <div className="mt-3 border-t border-theme pt-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">Sources</div>
        <div className="flex flex-wrap gap-1.5">
          {sources.map((c, i) => (
            <span
              key={`${c.title}-${i}`}
              className="rounded-full border border-theme bg-theme-secondary/60 px-2.5 py-0.5 text-[10px] text-theme-muted"
              title={c.sourceType ? `${c.title} (${c.sourceType})` : c.title}
            >
              {c.title}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderMessageImages = (images) => {
    if (!Array.isArray(images) || !images.length) return null;
    return (
      <div className={`flex flex-wrap gap-2 ${images.length ? 'mb-2' : ''}`}>
        {images.map((img, idx) => (
          <a
            key={`${img.name || 'image'}-${idx}`}
            href={img.dataUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-white/20"
            title={img.name || 'Attached image'}
          >
            <img
              src={img.dataUrl}
              alt={img.name || `Attachment ${idx + 1}`}
              className="max-h-40 max-w-[12rem] object-cover"
            />
          </a>
        ))}
      </div>
    );
  };

  const renderMessage = ({ msg, originalIndex }) => {
    const isUser = msg.role === 'user';
    const isError = msg.isError;
    const content = String(msg.content || '').trim();
    const messageImages = Array.isArray(msg.images) ? msg.images : [];
    const messageFiles = Array.isArray(msg.files) ? msg.files : [];
    const assistantMedia = Array.isArray(msg.attachments) ? msg.attachments : [];
    const messageCitations = Array.isArray(msg.citations) ? msg.citations : [];
    const messageKey = `${originalIndex}-${msg.timestamp || originalIndex}`;
    const isEditing = isUser && editingMessageIndex === originalIndex;
    const showAssistantActions = !isUser && content.length > 0;
    const hasVisibleContent = Boolean(content) || messageImages.length > 0 || messageFiles.length > 0 || assistantMedia.length > 0;

    if (isUser && !hasVisibleContent) return null;

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
            <>
              {renderMessageImages(messageImages)}
              {renderMessageFiles(messageFiles)}
              {content ? <div className="whitespace-pre-wrap">{content}</div> : null}
            </>
          ) : (
            <>
              {renderAssistantMedia(assistantMedia)}
              <AgentMarkdown content={content} className={isError ? 'text-red-400' : ''} />
              {renderMessageSources(messageCitations)}
            </>
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
  const canSend = Boolean(input.trim()) || pendingAttachments.length > 0;

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
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!messages.length && !isStreaming && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MdSmartToy className="mb-3 h-12 w-12 text-theme-muted" />
              <h2 className="text-lg font-semibold text-theme-primary">DeskMaster Agent</h2>
              <p className="mt-2 max-w-md text-sm text-theme-muted">
                Ask anything, attach files, or use the + menu to enable Knowledge Base, tools, and integrations.
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
                {renderAssistantMedia(streamingAttachments)}
                <AgentMarkdown content={streamingText} />
                {renderMessageSources(streamingCitations)}
                <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-red-500" />
              </div>
            </div>
          )}

          {generatedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2 px-1">
              {generatedFiles.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => openGeneratedFile(file.name)}
                  className="inline-flex items-center gap-1 rounded-lg border border-theme bg-theme-card px-3 py-2 text-xs text-theme-primary hover:bg-theme-secondary"
                >
                  <MdDownload className="h-3.5 w-3.5" />
                  Download {file.name}
                </button>
              ))}
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
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-theme px-3 py-2">
                  {pendingAttachments.map((item, idx) => (
                    <div key={`pending-${item.name}-${idx}`} className="relative">
                      {item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={item.name || `Attachment ${idx + 1}`}
                          className="h-16 w-16 rounded-lg border border-theme object-cover"
                        />
                      ) : (
                        <div className="flex h-16 min-w-[8rem] max-w-[12rem] items-center gap-1 rounded-lg border border-theme bg-theme-card px-2 text-[11px] text-theme-primary">
                          <MdAttachFile className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.name || `Document ${idx + 1}`}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(idx)}
                        disabled={isStreaming}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-theme-primary text-theme-muted shadow hover:text-red-500 disabled:opacity-50"
                        title="Remove attachment"
                      >
                        <MdClose className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.md,.json,.html,.htm,.csv,.xml,.yaml,.yml"
                multiple
                tabIndex={-1}
                aria-hidden="true"
                className="pointer-events-none absolute h-px w-px opacity-0"
                style={{ left: '-9999px' }}
                onChange={handleFileSelect}
              />
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
                rows={1}
                disabled={isStreaming || noProviders}
                className="w-full resize-none bg-transparent px-3 py-3 text-sm text-theme-primary placeholder:text-theme-muted focus:outline-none"
              />
              <div className="flex items-center gap-1 px-2 pb-2">
                <div className="relative" ref={inputMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInputMenu((v) => !v);
                      setShowModelMenu(false);
                    }}
                    disabled={isStreaming}
                    title="Add tools & attachments"
                    className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                      showInputMenu || enabledCapabilityCount > 0 || isReindexingKb
                        ? 'border-theme bg-theme-card text-theme-primary'
                        : 'border-transparent text-theme-muted hover:bg-theme-card hover:text-theme-primary'
                    } disabled:opacity-50`}
                  >
                    {isReindexingKb ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-theme-muted border-t-red-500" />
                    ) : (
                      <MdAdd className="h-5 w-5" />
                    )}
                  </button>
                  {showInputMenu && (
                    <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-theme bg-theme-primary shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          handleAttachFiles();
                          setShowInputMenu(false);
                        }}
                        disabled={isStreaming || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-theme-primary hover:bg-theme-secondary disabled:opacity-50"
                      >
                        <MdAttachFile className="h-4 w-4 text-theme-muted" />
                        Add photos & files
                      </button>
                      <div className="border-t border-theme" />
                      <div className="p-1">
                        {Object.keys(CAPABILITY_META).map((key) => (
                          <CapabilityMenuItem
                            key={key}
                            id={key}
                            enabled={capabilities[key]}
                            onToggle={toggleCapability}
                            disabled={isStreaming}
                          />
                        ))}
                      </div>
                      {capabilities.knowledgeBase && (
                        <>
                          <div className="border-t border-theme" />
                          <button
                            type="button"
                            onClick={handleReindexKb}
                            disabled={isStreaming || isReindexingKb}
                            title={`KB: ${kbStatus?.documents || 0} docs, ${kbStatus?.chunks || 0} chunks`}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-theme-primary hover:bg-theme-secondary disabled:opacity-50"
                          >
                            {isReindexingKb ? (
                              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-theme-muted border-t-red-500" />
                            ) : (
                              <MdRefresh className="h-4 w-4 shrink-0 text-theme-muted" />
                            )}
                            <span className="flex-1">{isReindexingKb ? 'Reindexing knowledge base…' : 'Reindex knowledge base'}</span>
                          </button>
                        </>
                      )}
                      <div className="border-t border-theme" />
                      <button
                        type="button"
                        disabled={isStreaming}
                        onClick={() => setShowIntegrations((v) => !v)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-theme-primary hover:bg-theme-secondary disabled:opacity-50"
                      >
                        <MdTune className="h-4 w-4 text-theme-muted" />
                        <span className="flex-1">Connect apps</span>
                        <MdArrowDropDown className={`h-4 w-4 text-theme-muted transition-transform ${showIntegrations ? 'rotate-180' : ''}`} />
                      </button>
                      {showIntegrations && (
                        <div className="max-h-56 overflow-y-auto border-t border-theme bg-theme-secondary/20 p-2">
                          <p className="mb-2 px-1 text-[10px] text-theme-muted">Connect OAuth apps for the agent.</p>
                          {composioToolkits.map((t) => (
                            <div key={t.slug} className="mb-2 rounded-lg border border-theme/60 bg-theme-primary p-2">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-theme-primary">{t.name}</span>
                                {connectingComposioSlug === t.slug ? (
                                  <button
                                    type="button"
                                    onClick={() => cancelComposioConnection(t.slug)}
                                    className="text-[10px] text-theme-muted hover:text-theme-primary"
                                  >
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
                                t.accounts.map((account) => (
                                  <div key={account.id} className="truncate text-[10px] text-green-500" title={account.label}>
                                    {account.label}
                                  </div>
                                ))
                              ) : (
                                <p className="text-[10px] text-theme-muted">Not connected</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1" />

                <div className="relative" ref={modelMenuRef}>
                  {enabledProviders.length > 0 && (
                    <>
                      <button
                        type="button"
                        disabled={isStreaming}
                        onClick={() => {
                          setShowModelMenu((v) => !v);
                          setShowInputMenu(false);
                        }}
                        className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-theme-muted transition-colors hover:bg-theme-card hover:text-theme-primary disabled:opacity-50"
                      >
                        <span className="max-w-[9rem] truncate">{modelLabel}</span>
                        <MdArrowDropDown className="h-4 w-4 shrink-0" />
                      </button>
                      {showModelMenu && (
                        <div className="absolute bottom-full right-0 z-30 mb-2 w-64 rounded-xl border border-theme bg-theme-primary p-3 shadow-xl">
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">Provider</div>
                          <div className="mb-3 space-y-1">
                            {enabledProviders.map((id) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => handleProviderChange(id)}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                  provider === id
                                    ? 'bg-red-500/10 text-red-500'
                                    : 'text-theme-primary hover:bg-theme-secondary'
                                }`}
                              >
                                <span>{PROVIDER_META[id]?.label || id}</span>
                                {provider === id && <MdCheck className="h-4 w-4" />}
                              </button>
                            ))}
                          </div>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-theme-muted">Model</div>
                          <input
                            type="text"
                            value={model}
                            onChange={(e) => {
                              setModel(e.target.value);
                              persistProviderModel(provider, e.target.value);
                            }}
                            disabled={isStreaming}
                            placeholder="Model name"
                            className="w-full rounded-lg border border-theme bg-theme-secondary px-3 py-2 text-xs font-mono text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500/30"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isStreaming || !canSend || noProviders}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white transition-opacity hover:bg-red-600 disabled:opacity-40"
                  title="Send message"
                >
                  <MdSend className="h-4 w-4" />
                </button>
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
