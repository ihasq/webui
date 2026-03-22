import { useState, useCallback, useMemo, useRef } from "react";
import type { InferenceParams } from "./use-chat";
import { defaultParams } from "./use-chat";

export interface Agent {
  id: string;
  nickname: string;
  endpoint: string;
  apiKey: string;
  model: string;
  params: InferenceParams;
  createdAt: number;
}

const STORAGE_KEY = "webui-agents";

function loadAgents(): Agent[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveAgents(agents: Agent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
}

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>(loadAgents);

  // Use ref for stable callbacks that need current agents
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // Sort agents alphabetically by nickname
  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => a.nickname.localeCompare(b.nickname));
  }, [agents]);

  // Stable persist function using functional update
  const persist = useCallback((updater: (prev: Agent[]) => Agent[]) => {
    setAgents((prev) => {
      const next = updater(prev);
      saveAgents(next);
      return next;
    });
  }, []);

  // Stable createAgent - no dependencies on agents
  const createAgent = useCallback(
    (agent: Omit<Agent, "id" | "createdAt">): string => {
      const id = crypto.randomUUID();
      const newAgent: Agent = {
        ...agent,
        id,
        createdAt: Date.now(),
      };
      persist((prev) => [...prev, newAgent]);
      return id;
    },
    [persist]
  );

  // Stable updateAgent - no dependencies on agents
  const updateAgent = useCallback(
    (id: string, updates: Partial<Omit<Agent, "id" | "createdAt">>) => {
      persist((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
      );
    },
    [persist]
  );

  // Stable deleteAgent - no dependencies on agents
  const deleteAgent = useCallback(
    (id: string) => {
      persist((prev) => prev.filter((a) => a.id !== id));
    },
    [persist]
  );

  // Stable getAgent using ref
  const getAgent = useCallback((id: string): Agent | undefined => {
    return agentsRef.current.find((a) => a.id === id);
  }, []);

  // Stable findAgentByNickname using ref
  const findAgentByNickname = useCallback((nickname: string): Agent | undefined => {
    const lower = nickname.toLowerCase();
    return agentsRef.current.find((a) => a.nickname.toLowerCase() === lower);
  }, []);

  // searchAgents still depends on sortedAgents for filtering
  const searchAgents = useCallback(
    (query: string): Agent[] => {
      if (!query) return sortedAgents;
      const lower = query.toLowerCase();
      return sortedAgents.filter((a) =>
        a.nickname.toLowerCase().includes(lower)
      );
    },
    [sortedAgents]
  );

  return {
    agents: sortedAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgent,
    findAgentByNickname,
    searchAgents,
  };
}

export function createDefaultAgent(): Omit<Agent, "id" | "createdAt"> {
  return {
    nickname: "",
    endpoint: "",
    apiKey: "",
    model: "",
    params: { ...defaultParams },
  };
}
