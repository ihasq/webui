import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useChat, defaultParams, type ChatConfig, type Attachment, type Message } from "@/hooks/use-chat";
import { loadAttachments } from "@/hooks/use-attachment-store";
import { useConversations, type Conversation } from "@/hooks/use-conversations";
import { ChatMessage } from "@/components/chat-message";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, Plus, X } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";

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

function AttachmentList({
  attachments,
  onReorder,
  onRemove,
}: {
  attachments: Attachment[];
  onReorder: (attachments: Attachment[]) => void;
  onRemove: (index: number) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = (i: number) => {
    setDragIdx(i);
  };

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setOverIdx(i);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...attachments];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(dropIdx, 0, moved);
    onReorder(next);
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="flex gap-2 overflow-x-auto px-2 pt-2">
      {attachments.map((a, i) => (
        <div
          key={`${a.name}-${i}`}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
          className={`group/att relative shrink-0 cursor-grab overflow-hidden rounded-lg border bg-muted transition-all active:cursor-grabbing ${
            dragIdx === i ? "opacity-40" : ""
          } ${overIdx === i && dragIdx !== i ? "ring-2 ring-ring" : ""}`}
        >
          {a.mimeType.startsWith("image/") ? (
            <img
              src={a.dataUrl}
              alt={a.name}
              className="h-16 w-16 object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-16 w-24 items-center justify-center px-2">
              <span className="truncate text-xs text-muted-foreground">
                {a.name}
              </span>
            </div>
          )}
          <button
            onClick={() => onRemove(i)}
            className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover/att:opacity-100"
          >
            <X className="size-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

const CONFIG_KEY = "webui-config";

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
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.innerWidth >= 768
  );
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  const {
    conversations,
    activeId,
    isLoading: conversationsLoading,
    createConversation,
    selectConversation,
    updateMessages,
    deleteConversation,
    duplicateConversation,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleConfigChange = useCallback((newConfig: ChatConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

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
    const threshold = 50; // pixels from bottom to consider "at bottom"
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    shouldAutoScrollRef.current = isAtBottom;
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

  // Select conversation: load its messages with attachment hydration and update URL hash
  const handleSelect = useCallback(
    async (id: string, updateHash = true) => {
      selectConversation(id);
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;

      // Update URL hash
      if (updateHash) {
        const hash = generateConversationHash(conv);
        window.history.replaceState(null, "", `#${hash}`);
      }

      const msgs = conv.messages ?? [];
      const hydrated = await hydrateAttachments(msgs);
      loadMessages(hydrated);
    },
    [conversations, selectConversation, loadMessages, hydrateAttachments]
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
        handleSelect(conv.id, false);
      } else {
        // Hash doesn't match any conversation: clear hash
        initialHashHandled.current = true;
        window.history.replaceState(null, "", window.location.pathname);
      }
    } else {
      initialHashHandled.current = true;
    }
  }, [conversationsLoading, conversations, handleSelect]);

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
        await handleSelect(conv.id, false);
      } else {
        // Hash doesn't match any conversation: clear hash
        window.history.replaceState(null, "", window.location.pathname);
        newChat();
        clear();
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [handleSelect, newChat, clear]);

  // New chat: clear messages, deselect, and clear URL hash
  const handleNew = useCallback(() => {
    newChat();
    clear();
    window.history.replaceState(null, "", window.location.pathname);
  }, [newChat, clear]);

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

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            {
              name: file.name,
              mimeType: file.type,
              dataUrl: reader.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
      // Reset so the same file can be selected again
      e.target.value = "";
    },
    []
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(() => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    let convId = activeIdRef.current;
    const isNewConversation = !convId;

    if (!convId) {
      convId = createConversation();
      activeIdRef.current = convId;
    }

    // Enable auto-scroll when sending a new message
    shouldAutoScrollRef.current = true;

    chatSend(input, attachments.length > 0 ? attachments : undefined);

    // Update URL hash (for new conversations, this is the first user message)
    if (isNewConversation && convId) {
      const hash = encodeURIComponent(`${input.trim()}${convId}`);
      window.history.replaceState(null, "", `#${hash}`);
    }

    setInput("");
    setAttachments([]);
    textareaRef.current?.focus();
  }, [input, attachments, isLoading, createConversation, chatSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
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

  // Prevent auto-scroll when focusing textarea on mobile
  const handleTextareaFocus = useCallback(() => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollTop;
      }
    });
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        config={config}
        onConfigChange={handleConfigChange}
        isDark={isDark}
        onToggleDark={() => setIsDark((d) => !d)}
        isOpen={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((o) => !o)}
      />

      {/* Main chat area */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto pb-24">
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
                />
              ))
            )}
          </div>
        </div>

        {/* Floating input */}
        <div
          ref={inputContainerRef}
          className="pointer-events-none fixed inset-x-0 p-4 transition-[bottom] duration-100"
          style={{ bottom: keyboardOffset }}
        >
          <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border bg-background/60 shadow-lg backdrop-blur-md">
            {/* Attachment previews (drag to reorder) */}
            {attachments.length > 0 && (
              <AttachmentList
                attachments={attachments}
                onReorder={setAttachments}
                onRemove={removeAttachment}
              />
            )}

            {/* Input row */}
            <div className="flex gap-2 p-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.csv,.json,.md"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square h-auto shrink-0 self-stretch"
              >
                <Plus className="size-4" />
              </Button>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={handleTextareaFocus}
                placeholder="Type prompt..."
                className="min-h-10 max-h-40 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0"
                rows={1}
              />
              {isLoading ? (
                <Button
                  variant="destructive"
                  onClick={stop}
                  className="aspect-square h-auto shrink-0 self-stretch"
                >
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() && attachments.length === 0}
                  className="aspect-square h-auto shrink-0 self-stretch"
                >
                  <Send className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      <Toaster position="top-center" theme={isDark ? "dark" : "light"} />
    </div>
  );
}
