import { useState, useRef, useEffect, useCallback } from "react";
import { useChat, defaultParams, type ChatConfig, type Attachment, type Message } from "@/hooks/use-chat";
import { loadAttachments } from "@/hooks/use-attachment-store";
import { useConversations, type Conversation } from "@/hooks/use-conversations";
import { useAgents, type Agent } from "@/hooks/use-agents";
import { ChatMessage } from "@/components/chat-message";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { SettingsSidebar } from "@/components/settings-sidebar";
import { UpdatePrompt } from "@/components/update-prompt";
import { useUpdateChecker } from "@/hooks/use-update-checker";
import { ChatInput } from "@/components/chat-input";

/** Generate a URL hash for a conversation: first user prompt + UUID */
function generateConversationHash(conv: Conversation): string {
  const firstUserMessage = conv.messages.find((m) => m.role === "user");
  const prefix = firstUserMessage?.content ?? "";
  return encodeURIComponent(`${prefix}${conv.id}`);
}

/** Find a conversation by its URL hash */
function findConversationByHash(
  conversations: Conversation[],
  hash: string
): Conversation | undefined {
  if (!hash) return undefined;
  const decoded = decodeURIComponent(hash);
  return conversations.find((conv) => {
    const firstUserMessage = conv.messages.find((m) => m.role === "user");
    const prefix = firstUserMessage?.content ?? "";
    return `${prefix}${conv.id}` === decoded;
  });
}

const CONFIG_KEY = "webui-config";
const SIDEBAR_WIDTH_KEY = "webui-sidebar-width";
const SETTINGS_SIDEBAR_WIDTH_KEY = "webui-settings-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 256; // w-64 = 16rem
const DEFAULT_SETTINGS_SIDEBAR_WIDTH = 288; // w-72 = 18rem

function loadConfig(): ChatConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...parsed, params: { ...defaultParams, ...parsed.params } };
    }
  } catch {
    // ignore
  }
  return { endpoint: "http://localhost:11434/v1", apiKey: "", model: "", params: defaultParams };
}

function saveConfig(config: ChatConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export default function App() {
  const [config, setConfig] = useState<ChatConfig>(loadConfig);
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.innerWidth >= 768
  );
  const [settingsSidebarOpen, setSettingsSidebarOpen] = useState(() =>
    window.innerWidth >= 768
  );
  // Track desktop sidebar states for restoration after mobile
  const desktopSidebarOpenRef = useRef(true);
  const desktopSettingsSidebarOpenRef = useRef(true);
  const wasMobileRef = useRef(window.innerWidth < 768);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? Number(stored) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [settingsSidebarWidth, setSettingsSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY);
    return stored ? Number(stored) : DEFAULT_SETTINGS_SIDEBAR_WIDTH;
  });
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  const { updateAvailable, applyUpdate, dismissUpdate } = useUpdateChecker();
  const { agents, createAgent, updateAgent, deleteAgent, getAgent } = useAgents();

  const {
    conversations,
    activeId,
    isLoading: conversationsLoading,
    createConversation,
    selectConversation,
    updateMessages,
    deleteConversation,
    duplicateConversation,
    togglePin,
    newChat,
  } = useConversations();

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  // Save messages to conversation store (one-way: chat → store)
  const onMessagesChange = useCallback(
    (msgs: import("@/hooks/use-chat").Message[]) => {
      const id = activeIdRef.current;
      if (id) updateMessages(id, msgs);
    },
    [updateMessages]
  );

  const {
    messages, isLoading, send: chatSend, stop, clear, loadMessages,
    editMessage, resend, regenerate,
  } = useChat(config, onMessagesChange);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);

  const handleConfigChange = useCallback((newConfig: ChatConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  }, []);

  const handleSidebarResizeEnd = useCallback((newWidth: number) => {
    setSidebarWidth(newWidth);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(newWidth));
  }, []);

  const handleSettingsSidebarResizeEnd = useCallback((newWidth: number) => {
    setSettingsSidebarWidth(newWidth);
    localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_KEY, String(newWidth));
  }, []);

  const handleSettingsSidebarToggle = useCallback(() => {
    setSettingsSidebarOpen((o) => {
      const newState = !o;
      if (window.innerWidth >= 768) {
        desktopSettingsSidebarOpenRef.current = newState;
      }
      return newState;
    });
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleAgentSelect = useCallback((agent: Agent | null) => {
    setActiveAgentId(agent?.id ?? null);
  }, []);

  const handleToggleDark = useCallback(() => {
    setIsDark((d) => !d);
  }, []);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen((o) => {
      const newState = !o;
      if (window.innerWidth >= 768) {
        desktopSidebarOpenRef.current = newState;
      }
      return newState;
    });
    if (window.innerWidth < 768) {
      setSettingsSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Handle sidebar state transitions between mobile and desktop
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      const wasMobile = wasMobileRef.current;

      if (isMobile && !wasMobile) {
        // Transitioning to mobile: save desktop states and close
        desktopSidebarOpenRef.current = sidebarOpen;
        desktopSettingsSidebarOpenRef.current = settingsSidebarOpen;
        setSidebarOpen(false);
        setSettingsSidebarOpen(false);
      } else if (!isMobile && wasMobile) {
        // Transitioning to desktop: restore saved states
        setSidebarOpen(desktopSidebarOpenRef.current);
        setSettingsSidebarOpen(desktopSettingsSidebarOpenRef.current);
      }

      wasMobileRef.current = isMobile;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen, settingsSidebarOpen]);

  // Handle mobile keyboard visibility
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleViewportChange = () => {
      // Calculate keyboard height
      const keyboardHeight = window.innerHeight - viewport.height;
      setKeyboardOffset(Math.max(0, keyboardHeight));

      // Force scroll position to top to prevent PWA auto-scroll
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    };

    viewport.addEventListener("resize", handleViewportChange);
    viewport.addEventListener("scroll", handleViewportChange);

    return () => {
      viewport.removeEventListener("resize", handleViewportChange);
      viewport.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  // Auto-scroll to bottom when messages change, if user is at bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && shouldAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Track scroll position to determine if user is at bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const currentScrollTop = el.scrollTop;
    const currentScrollHeight = el.scrollHeight;
    const lastScrollTop = lastScrollTopRef.current;
    const lastScrollHeight = lastScrollHeightRef.current;

    // Detect if this scroll was caused by user scrolling up (not layout change)
    const scrollHeightChanged = currentScrollHeight !== lastScrollHeight;
    const userScrolledUp = currentScrollTop < lastScrollTop && !scrollHeightChanged;

    // If user intentionally scrolled up, disable auto-scroll
    if (userScrolledUp) {
      shouldAutoScrollRef.current = false;
    }

    // Check if user scrolled back to bottom
    const threshold = 50;
    const isAtBottom = currentScrollHeight - currentScrollTop - el.clientHeight < threshold;
    if (isAtBottom) {
      shouldAutoScrollRef.current = true;
    }

    // Update refs for next comparison
    lastScrollTopRef.current = currentScrollTop;
    lastScrollHeightRef.current = currentScrollHeight;
  }, []);

  // Restore attachment data from IndexedDB for messages that have stripped attachments
  const hydrateAttachments = useCallback(async (msgs: Message[]): Promise<Message[]> => {
    const hydrated = await Promise.all(
      msgs.map(async (m) => {
        if (!m.attachments?.length) return m;
        // If dataUrl is empty, restore from IndexedDB
        if (m.attachments.some((a) => !a.dataUrl)) {
          const stored = await loadAttachments(m.id);
          if (stored.length) return { ...m, attachments: stored };
        }
        return m;
      })
    );
    return hydrated;
  }, []);

  // Internal: load conversation messages without hash update
  const loadConversation = useCallback(
    async (conv: Conversation) => {
      selectConversation(conv.id);
      const msgs = conv.messages ?? [];
      const hydrated = await hydrateAttachments(msgs);
      loadMessages(hydrated);
    },
    [selectConversation, loadMessages, hydrateAttachments]
  );

  // Select conversation: load its messages with attachment hydration and update URL hash
  const handleSelect = useCallback(
    async (id: string, searchQuery?: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;

      // Update URL hash
      const hash = generateConversationHash(conv);
      window.history.replaceState(null, "", `#${hash}`);

      // Set search highlight for scrolling to match
      setSearchHighlight(searchQuery ?? null);

      await loadConversation(conv);
    },
    [conversations, loadConversation]
  );

  // Track if initial hash navigation has been done
  const initialHashHandled = useRef(false);

  // Handle URL hash on initial load (after conversations are loaded)
  useEffect(() => {
    if (conversationsLoading || initialHashHandled.current) return;

    const hash = window.location.hash.slice(1);
    if (hash) {
      const conv = findConversationByHash(conversations, hash);
      if (conv) {
        initialHashHandled.current = true;
        loadConversation(conv);
      } else {
        // Hash doesn't match any conversation: clear hash
        initialHashHandled.current = true;
        window.history.replaceState(null, "", window.location.pathname);
      }
    } else {
      initialHashHandled.current = true;
    }
  }, [conversationsLoading, conversations, loadConversation]);

  // Listen for hash changes while app is running
  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash.slice(1);
      if (!hash) {
        newChat();
        clear();
        return;
      }

      const conv = findConversationByHash(conversationsRef.current, hash);
      if (conv) {
        await loadConversation(conv);
      } else {
        // Hash doesn't match any conversation: clear hash
        window.history.replaceState(null, "", window.location.pathname);
        newChat();
        clear();
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [loadConversation, newChat, clear]);

  // New chat: clear messages, deselect, and clear URL hash
  const handleNew = useCallback(() => {
    newChat();
    clear();
    window.history.replaceState(null, "", window.location.pathname);
  }, [newChat, clear]);

  // Keyboard shortcut: Ctrl+Shift+O for new chat
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleNew();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNew]);

  // Delete conversation: if active, also clear messages and hash
  const handleDelete = useCallback(
    (id: string) => {
      deleteConversation(id);
      if (activeIdRef.current === id) {
        clear();
        window.history.replaceState(null, "", window.location.pathname);
      }
    },
    [deleteConversation, clear]
  );

  // Duplicate conversation and load the copy
  const handleDuplicate = useCallback(
    (id: string) => {
      duplicateConversation(id);
    },
    [duplicateConversation]
  );

  const handleSend = useCallback(
    (content: string, attachments?: Attachment[]) => {
      if (isLoading) return;

      let convId = activeIdRef.current;
      const isNewConversation = !convId;

      if (!convId) {
        convId = createConversation();
        activeIdRef.current = convId;
      }

      // Enable auto-scroll when sending a new message
      shouldAutoScrollRef.current = true;

      chatSend(content, attachments);

      // Update URL hash (for new conversations, this is the first user message)
      if (isNewConversation && convId) {
        const hash = encodeURIComponent(`${content.trim()}${convId}`);
        window.history.replaceState(null, "", `#${hash}`);
      }
    },
    [isLoading, createConversation, chatSend]
  );

  const handleResend = useCallback(
    async (messageId: string, content: string) => {
      shouldAutoScrollRef.current = true;
      await resend(messageId, content);
    },
    [resend]
  );

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      shouldAutoScrollRef.current = true;
      await regenerate(messageId);
    },
    [regenerate]
  );

  const handleAgentSelectFromInput = useCallback(
    (agent: Agent) => {
      const newConfig = {
        endpoint: agent.endpoint,
        apiKey: agent.apiKey,
        model: agent.model,
        params: agent.params,
      };
      setConfig(newConfig);
      saveConfig(newConfig);
      setActiveAgentId(agent.id);
    },
    []
  );

  const handleClearAgent = useCallback(() => {
    setActiveAgentId(null);
  }, []);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onTogglePin={togglePin}
        isDark={isDark}
        onToggleDark={handleToggleDark}
        isOpen={sidebarOpen}
        onToggleOpen={handleSidebarToggle}
        width={sidebarWidth}
        onResizeEnd={handleSidebarResizeEnd}
      />

      {/* Main chat area */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto pb-32">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 ? (
              <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
                <p>Send a message to start a conversation.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isAnimating={
                    isLoading &&
                    msg.role === "assistant" &&
                    i === messages.length - 1
                  }
                  isLoading={isLoading}
                  onEdit={editMessage}
                  onResend={handleResend}
                  onRegenerate={handleRegenerate}
                  searchHighlight={searchHighlight}
                  onHighlightShown={() => setSearchHighlight(null)}
                />
              ))
            )}
          </div>
        </div>

        {/* Floating input */}
        <div
          className="input-container pointer-events-none inset-x-0 p-4"
          style={{ bottom: keyboardOffset }}
        >
          <ChatInput
            onSend={handleSend}
            onStop={stop}
            isLoading={isLoading}
            agents={agents}
            activeAgentId={activeAgentId}
            onAgentSelect={handleAgentSelectFromInput}
            onClearAgent={handleClearAgent}
          />
        </div>
      </div>

      <SettingsSidebar
        config={config}
        onChange={handleConfigChange}
        isOpen={settingsSidebarOpen}
        onToggleOpen={handleSettingsSidebarToggle}
        activeAgentId={activeAgentId}
        onAgentSelect={handleAgentSelect}
        width={settingsSidebarWidth}
        onResizeEnd={handleSettingsSidebarResizeEnd}
        agents={agents}
        onCreateAgent={createAgent}
        onUpdateAgent={updateAgent}
        onDeleteAgent={deleteAgent}
        getAgent={getAgent}
      />

      {updateAvailable && (
        <UpdatePrompt onUpdate={applyUpdate} onDismiss={dismissUpdate} />
      )}

      <Toaster position="top-center" theme={isDark ? "dark" : "light"} />
    </div>
  );
}
