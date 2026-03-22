import { useState, useCallback, useEffect, useMemo } from "react";
import { get, set } from "idb-keyval";
import type { Message } from "./use-chat";
import { deleteAttachments } from "./use-attachment-store";

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  pinned?: boolean;
}

const STORAGE_KEY = "webui-conversations";

// Strip base64 attachment data before saving to reduce storage size
function stripAttachments(conversations: Conversation[]): Conversation[] {
  return conversations.map((c) => ({
    ...c,
    messages: c.messages.map((m) => {
      if (!m.attachments?.length) return m;
      return {
        ...m,
        attachments: m.attachments.map((a) => ({
          name: a.name,
          mimeType: a.mimeType,
          dataUrl: "", // strip data; full data stored separately via use-attachment-store
        })),
      };
    }),
  }));
}

async function loadFromIdb(): Promise<Conversation[]> {
  try {
    const stored = await get<Conversation[]>(STORAGE_KEY);
    if (stored) return stored;
    // Migrate from localStorage if exists
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Conversation[];
      await set(STORAGE_KEY, parsed);
      localStorage.removeItem(STORAGE_KEY);
      return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

async function saveToIdb(conversations: Conversation[]) {
  const stripped = stripAttachments(conversations);
  await set(STORAGE_KEY, stripped);
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load conversations from IndexedDB on mount
  useEffect(() => {
    loadFromIdb().then((loaded) => {
      setConversations(loaded);
      setIsLoading(false);
    });
  }, []);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const persist = useCallback((next: Conversation[]) => {
    setConversations(next);
    saveToIdb(next);
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
        saveToIdb(next);
        return next;
      });
    },
    []
  );

  const deleteConversation = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (conv) {
        for (const m of conv.messages) {
          if (m.attachments?.length) deleteAttachments(m.id);
        }
      }
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

  const togglePin = useCallback(
    (id: string) => {
      const next = conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c
      );
      persist(next);
    },
    [conversations, persist]
  );

  const newChat = useCallback(() => {
    setActiveId(null);
  }, []);

  // Sort conversations: pinned first, then by createdAt descending
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [conversations]);

  return {
    conversations: sortedConversations,
    active,
    activeId,
    isLoading,
    createConversation,
    selectConversation,
    updateMessages,
    deleteConversation,
    duplicateConversation,
    togglePin,
    newChat,
  };
}
