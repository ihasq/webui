import { useState, useRef, useCallback, useEffect } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface InferenceParams {
  systemPrompt: string;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxTokens: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  stop: string;
  seed: number | null;
}

export interface ChatConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  params: InferenceParams;
}

export const defaultParams: InferenceParams = {
  systemPrompt: "",
  temperature: null,
  topP: null,
  topK: null,
  maxTokens: null,
  frequencyPenalty: null,
  presencePenalty: null,
  stop: "",
  seed: null,
};

export function useChat(
  config: ChatConfig,
  onMessagesChange?: (messages: Message[]) => void,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    onMessagesChangeRef.current?.(messages);
  }, [messages]);

  const loadMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  /**
   * Core streaming function. Takes the conversation history to send
   * and the assistant message ID to stream into.
   */
  const streamResponse = useCallback(
    async (
      history: { role: string; content: string }[],
      assistantId: string,
    ) => {
      const cfg = configRef.current;
      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const apiMessages: { role: string; content: string }[] = [];
        if (cfg.params.systemPrompt.trim()) {
          apiMessages.push({
            role: "system",
            content: cfg.params.systemPrompt.trim(),
          });
        }
        apiMessages.push(...history);

        const baseUrl = cfg.endpoint.replace(/\/+$/, "");
        const url = baseUrl.endsWith("/chat/completions")
          ? baseUrl
          : `${baseUrl}/chat/completions`;

        const { params } = cfg;
        const body: Record<string, unknown> = {
          model: cfg.model,
          messages: apiMessages,
          stream: true,
        };

        if (params.temperature !== null) body.temperature = params.temperature;
        if (params.topP !== null) body.top_p = params.topP;
        if (params.topK !== null) body.top_k = params.topK;
        if (params.maxTokens !== null) body.max_tokens = params.maxTokens;
        if (params.frequencyPenalty !== null) body.frequency_penalty = params.frequencyPenalty;
        if (params.presencePenalty !== null) body.presence_penalty = params.presencePenalty;
        if (params.seed !== null) body.seed = params.seed;

        const stopSeqs = params.stop
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (stopSeqs.length > 0) body.stop = stopSeqs;

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cfg.apiKey && { Authorization: `Bearer ${cfg.apiKey}` }),
          },
          body: JSON.stringify(body),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`API error ${res.status}: ${errorText}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + delta }
                      : m
                  )
                );
              }
            } catch {
              // skip malformed JSON chunks
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // user cancelled
        } else {
          const errorMsg =
            err instanceof Error ? err.message : "Unknown error";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${errorMsg}` }
                : m
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    []
  );

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
      };
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await streamResponse(history, assistantMessage.id);
    },
    [isLoading, messages, streamResponse]
  );

  /** Edit a message in-place without re-requesting */
  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, content: newContent } : m
        )
      );
    },
    []
  );

  /** Edit a user message, truncate everything after it, and re-request */
  const resend = useCallback(
    async (messageId: string, newContent: string) => {
      if (isLoading) return;

      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const edited: Message = { ...messages[idx], content: newContent.trim() };
      const kept = [...messages.slice(0, idx), edited];
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages([...kept, assistantMessage]);
      setIsLoading(true);

      const history = kept.map((m) => ({ role: m.role, content: m.content }));
      await streamResponse(history, assistantMessage.id);
    },
    [isLoading, messages, streamResponse]
  );

  /** Regenerate an assistant response (re-request using messages up to the preceding user message) */
  const regenerate = useCallback(
    async (messageId: string) => {
      if (isLoading) return;

      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      const kept = messages.slice(0, idx);
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages([...kept, assistantMessage]);
      setIsLoading(true);

      const history = kept.map((m) => ({ role: m.role, content: m.content }));
      await streamResponse(history, assistantMessage.id);
    },
    [isLoading, messages, streamResponse]
  );

  const clear = useCallback(() => {
    stop();
    setMessages([]);
  }, [stop]);

  return {
    messages,
    isLoading,
    send,
    stop,
    clear,
    loadMessages,
    editMessage,
    resend,
    regenerate,
  };
}
