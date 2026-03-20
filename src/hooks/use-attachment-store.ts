import { get, set, del, keys } from "idb-keyval";
import type { Attachment } from "./use-chat";

// Store attachment data in IndexedDB keyed by "att:<messageId>".
// Each entry is an array of Attachment objects (with full dataUrl).

function key(messageId: string) {
  return `att:${messageId}`;
}

export async function saveAttachments(messageId: string, attachments: Attachment[]) {
  if (!attachments.length) return;
  await set(key(messageId), attachments);
}

export async function loadAttachments(messageId: string): Promise<Attachment[]> {
  return (await get<Attachment[]>(key(messageId))) ?? [];
}

export async function deleteAttachments(messageId: string) {
  await del(key(messageId));
}

export async function deleteAllAttachments(messageIds: string[]) {
  await Promise.all(messageIds.map((id) => del(key(id))));
}

/** Clean up orphaned attachments not referenced by any known message ID */
export async function cleanupOrphanedAttachments(activeMessageIds: Set<string>) {
  const allKeys = await keys<string>();
  const orphaned = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith("att:") && !activeMessageIds.has(k.slice(4))
  );
  await Promise.all(orphaned.map((k) => del(k)));
}
