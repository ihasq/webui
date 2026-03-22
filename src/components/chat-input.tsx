import { useState, useCallback, useRef, memo, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, Plus, X, Bot } from "lucide-react";
import type { Agent } from "@/hooks/use-agents";
import { AgentMentionPopup } from "@/components/agent-mention-popup";
import type { Attachment } from "@/hooks/use-chat";

interface AttachmentListProps {
  attachments: Attachment[];
  onReorder: (attachments: Attachment[]) => void;
  onRemove: (index: number) => void;
}

const AttachmentList = memo(function AttachmentList({
  attachments,
  onReorder,
  onRemove,
}: AttachmentListProps) {
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
});

interface ChatInputProps {
  onSend: (content: string, attachments?: Attachment[]) => void;
  onStop: () => void;
  isLoading: boolean;
  agents: Agent[];
  activeAgentId: string | null;
  onAgentSelect: (agent: Agent) => void;
  onClearAgent: () => void;
}

export const ChatInput = memo(function ChatInput({
  onSend,
  onStop,
  isLoading,
  agents,
  activeAgentId,
  onAgentSelect,
  onClearAgent,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [showAgentPopup, setShowAgentPopup] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMultiLineRef = useRef(isMultiLine);
  const showAgentPopupRef = useRef(showAgentPopup);
  const agentQueryRef = useRef(agentQuery);

  // Keep refs in sync
  isMultiLineRef.current = isMultiLine;
  showAgentPopupRef.current = showAgentPopup;
  agentQueryRef.current = agentQuery;

  const activeAgent = activeAgentId
    ? agents.find((a) => a.id === activeAgentId)
    : null;

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
      e.target.value = "";
    },
    []
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(() => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    onSend(input, attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);

    // On mobile, blur to dismiss keyboard; on desktop, keep focus
    if (window.innerWidth < 768) {
      textareaRef.current?.blur();
    } else {
      textareaRef.current?.focus();
    }
  }, [input, attachments, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Don't send if agent popup is open
      if (showAgentPopupRef.current) {
        if (["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) {
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Check if textarea has multiple lines - only update if changed
    const nowMultiLine = e.target.scrollHeight > 44;
    if (nowMultiLine !== isMultiLineRef.current) {
      setIsMultiLine(nowMultiLine);
    }

    // Detect @ mention for agent
    const atIndex = value.lastIndexOf("@");
    if (atIndex >= 0) {
      const afterAt = value.slice(atIndex + 1);
      const charBefore = value[atIndex - 1];
      if (atIndex === 0 || charBefore === " " || charBefore === "\n") {
        if (!afterAt.includes(" ") && !afterAt.includes("\n")) {
          if (agentQueryRef.current !== afterAt) setAgentQuery(afterAt);
          if (!showAgentPopupRef.current) setShowAgentPopup(true);
        } else {
          if (showAgentPopupRef.current) setShowAgentPopup(false);
        }
      } else {
        if (showAgentPopupRef.current) setShowAgentPopup(false);
      }
    } else {
      if (showAgentPopupRef.current) setShowAgentPopup(false);
    }
  }, []);

  const handleAgentPopupSelect = useCallback(
    (agent: Agent) => {
      onAgentSelect(agent);
      // Remove @query from input
      setInput((prev) => {
        const atIndex = prev.lastIndexOf("@");
        return atIndex >= 0 ? prev.slice(0, atIndex) : prev;
      });
      setShowAgentPopup(false);
      setAgentQuery("");
      textareaRef.current?.focus();
    },
    [onAgentSelect]
  );

  const handleAgentPopupClose = useCallback(() => {
    setShowAgentPopup(false);
    setAgentQuery("");
  }, []);

  // Prevent auto-scroll when focusing textarea on mobile
  const handleTextareaFocus = useCallback(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }, []);

  return (
    <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border bg-background/60 shadow-lg backdrop-blur-md">
      {/* Active agent badge */}
      {activeAgent && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Bot className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Using @{activeAgent.nickname}
          </span>
          <button
            onClick={onClearAgent}
            className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <AttachmentList
          attachments={attachments}
          onReorder={setAttachments}
          onRemove={removeAttachment}
        />
      )}

      {/* Input row */}
      <div className={`flex gap-2 p-2 ${isMultiLine ? "items-end" : "items-center"}`}>
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
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className={`shrink-0 ${isMultiLine ? "self-start" : ""}`}
        >
          <Plus className="size-4" />
        </Button>
        <div className="relative min-w-0 flex-1">
          {showAgentPopup && (
            <AgentMentionPopup
              agents={agents}
              query={agentQuery}
              onSelect={handleAgentPopupSelect}
              onClose={handleAgentPopupClose}
              anchorRef={textareaRef}
            />
          )}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleTextareaFocus}
            placeholder={activeAgent ? `@${activeAgent.nickname} - Type prompt...` : "Type prompt..."}
            className="min-h-10 max-h-40 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0"
            rows={1}
          />
        </div>
        {isLoading ? (
          <Button
            variant="destructive"
            size="icon"
            onClick={onStop}
            className="shrink-0"
          >
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() && attachments.length === 0}
            className="shrink-0"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
});
