import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useChat, defaultParams, type ChatConfig } from "@/hooks/use-chat";
import { useConversations } from "@/hooks/use-conversations";
import { ChatMessage } from "@/components/chat-message";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square } from "lucide-react";

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
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.innerWidth >= 768
  );

  const {
    conversations,
    activeId,
    createConversation,
    selectConversation,
    updateMessages,
    deleteConversation,
    duplicateConversation,
    newChat,
  } = useConversations();

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

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

  const handleConfigChange = useCallback((newConfig: ChatConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Select conversation: load its messages
  const handleSelect = useCallback(
    (id: string) => {
      selectConversation(id);
      const conv = conversations.find((c) => c.id === id);
      loadMessages(conv?.messages ?? []);
    },
    [conversations, selectConversation, loadMessages]
  );

  // New chat: clear messages and deselect
  const handleNew = useCallback(() => {
    newChat();
    clear();
  }, [newChat, clear]);

  // Delete conversation: if active, also clear messages
  const handleDelete = useCallback(
    (id: string) => {
      deleteConversation(id);
      if (activeIdRef.current === id) {
        clear();
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

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;

    if (!activeIdRef.current) {
      const id = createConversation();
      activeIdRef.current = id;
    }

    chatSend(input);
    setInput("");
    textareaRef.current?.focus();
  }, [input, isLoading, createConversation, chatSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

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
        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-24">
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
                  onResend={resend}
                  onRegenerate={regenerate}
                />
              ))
            )}
          </div>
        </div>

        {/* Floating input */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
          <div className="pointer-events-auto mx-auto flex max-w-3xl gap-2 rounded-xl border bg-background/60 p-2 shadow-lg backdrop-blur-md">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Shift+Enter for new line)"
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
                disabled={!input.trim()}
                className="aspect-square h-auto shrink-0 self-stretch"
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
