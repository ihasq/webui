/**
 * Debug utilities for inspecting IndexedDB contents via devtools console
 *
 * Usage in devtools console:
 *   webui.conversations()     - List all conversations
 *   webui.conversation(id)    - Get specific conversation
 *   webui.messages(id)        - Get messages for a conversation
 *   webui.attachments(msgId)  - Get attachments for a message
 *   webui.agents()            - List all agents
 *   webui.clear()             - Clear all data (use with caution!)
 */

import { get, keys, clear } from "idb-keyval";
import { decompressHtml } from "./html-compression";

interface DebugUtils {
  conversations: () => Promise<unknown>;
  conversation: (id: string) => Promise<unknown>;
  messages: (conversationId: string) => Promise<unknown>;
  attachments: (messageId: string) => Promise<unknown>;
  agents: () => Promise<unknown>;
  stats: () => Promise<unknown>;
  clear: () => Promise<void>;
  decompressHtml: (compressed: string) => Promise<string>;
}

async function getConversations() {
  const data = await get("webui-conversations");
  console.table(
    (data as Array<{ id: string; title: string; messages: unknown[]; createdAt: number }>)?.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messages?.length ?? 0,
      createdAt: new Date(c.createdAt).toLocaleString(),
    }))
  );
  return data;
}

async function getConversation(id: string) {
  const data = await get("webui-conversations");
  const conv = (data as Array<{ id: string }>)?.find((c) => c.id === id);
  console.log(conv);
  return conv;
}

async function getMessages(conversationId: string) {
  const data = await get("webui-conversations");
  const conv = (data as Array<{ id: string; messages: unknown[] }>)?.find(
    (c) => c.id === conversationId
  );
  const messages = conv?.messages ?? [];
  console.table(
    (messages as Array<{ id: string; role: string; content: string; cachedHtml?: string }>).map((m) => ({
      id: m.id,
      role: m.role,
      contentLength: m.content?.length ?? 0,
      hasV2Cache: !!m.cachedHtml,
      cacheSize: m.cachedHtml?.length ?? 0,
      preview: m.content?.slice(0, 50) + (m.content?.length > 50 ? "..." : ""),
    }))
  );
  return messages;
}

async function getAttachments(messageId: string) {
  const data = await get(`att:${messageId}`);
  console.log(data);
  return data;
}

async function getAgents() {
  const data = localStorage.getItem("webui-agents");
  const agents = data ? JSON.parse(data) : [];
  console.table(
    agents.map((a: { id: string; nickname: string; endpoint: string; model: string }) => ({
      id: a.id,
      nickname: a.nickname,
      endpoint: a.endpoint,
      model: a.model,
    }))
  );
  return agents;
}

async function getStats() {
  const conversations = (await get("webui-conversations")) as Array<{
    messages: Array<{ cachedHtml?: string; content: string }>;
  }> | undefined;
  const allKeys = await keys();
  const attachmentKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith("att:")
  );

  let totalMessages = 0;
  let v2Messages = 0;
  let totalContentSize = 0;
  let totalCacheSize = 0;

  conversations?.forEach((c) => {
    c.messages?.forEach((m) => {
      totalMessages++;
      totalContentSize += m.content?.length ?? 0;
      if (m.cachedHtml) {
        v2Messages++;
        totalCacheSize += m.cachedHtml.length;
      }
    });
  });

  const stats = {
    conversationCount: conversations?.length ?? 0,
    totalMessages,
    v2Messages,
    v1Messages: totalMessages - v2Messages,
    attachmentCount: attachmentKeys.length,
    totalContentSize: `${(totalContentSize / 1024).toFixed(2)} KB`,
    totalCacheSize: `${(totalCacheSize / 1024).toFixed(2)} KB`,
  };

  console.table([stats]);
  return stats;
}

async function clearAll() {
  if (!confirm("This will delete all conversations and attachments. Are you sure?")) {
    console.log("Cancelled");
    return;
  }
  await clear();
  localStorage.removeItem("webui-agents");
  localStorage.removeItem("webui-config");
  console.log("All data cleared. Refresh the page.");
}

// Expose to window for devtools access
export function initDebugUtils() {
  const utils: DebugUtils = {
    conversations: getConversations,
    conversation: getConversation,
    messages: getMessages,
    attachments: getAttachments,
    agents: getAgents,
    stats: getStats,
    clear: clearAll,
    decompressHtml,
  };

  (window as unknown as { webui: DebugUtils }).webui = utils;

  console.log(
    "%c🔧 webui debug utils loaded",
    "color: #10b981; font-weight: bold;",
    "\n\nAvailable commands:",
    "\n  webui.conversations()    - List all conversations",
    "\n  webui.conversation(id)   - Get specific conversation",
    "\n  webui.messages(id)       - Get messages for a conversation",
    "\n  webui.attachments(msgId) - Get attachments for a message",
    "\n  webui.agents()           - List all agents",
    "\n  webui.stats()            - Storage statistics",
    "\n  webui.clear()            - Clear all data",
    "\n  webui.decompressHtml(s)  - Decompress cached HTML"
  );
}
