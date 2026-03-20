import { useState, useCallback } from "react";
import type { Message } from "./use-chat";

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const STORAGE_KEY = "webui-conversations";

function load(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return [];
}

function save(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(load);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const persist = useCallback((next: Conversation[]) => {
    setConversations(next);
    save(next);
  }, []);

  const createConversation = useCallback((): string => {
    const id = crypto.randomUUID();
    const conv: Conversation = {
      id,
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
    };
    persist([conv, ...conversations]);
    setActiveId(id);
    return id;
  }, [conversations, persist]);

  const selectConversation = useCallback((id: string | null) => {
    setActiveId(id);
  }, []);

  const updateMessages = useCallback(
    (id: string, messages: Message[]) => {
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== id) return c;
          const title =
            c.title === "New chat"
              ? messages.find((m) => m.role === "user")?.content.slice(0, 40) ??
                c.title
              : c.title;
          return { ...c, messages, title };
        });
        save(next);
        return next;
      });
    },
    []
  );

  const deleteConversation = useCallback(
    (id: string) => {
      const next = conversations.filter((c) => c.id !== id);
      persist(next);
      if (activeId === id) setActiveId(null);
    },
    [conversations, activeId, persist]
  );

  const duplicateConversation = useCallback(
    (id: string) => {
      const src = conversations.find((c) => c.id === id);
      if (!src) return;
      const newId = crypto.randomUUID();
      const conv: Conversation = {
        id: newId,
        title: src.title,
        messages: src.messages.map((m) => ({ ...m, id: crypto.randomUUID() })),
        createdAt: Date.now(),
      };
      persist([conv, ...conversations]);
      setActiveId(newId);
    },
    [conversations, persist]
  );

  const newChat = useCallback(() => {
    setActiveId(null);
  }, []);

  return {
    conversations,
    active,
    activeId,
    createConversation,
    selectConversation,
    updateMessages,
    deleteConversation,
    duplicateConversation,
    newChat,
  };
}
