import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";
import "katex/dist/katex.min.css";
import type { Message } from "@/hooks/use-chat";
import { useAnimatedText } from "@/hooks/use-animated-text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Pencil, RotateCcw } from "lucide-react";

const math = createMathPlugin({ singleDollarTextMath: true });

function convertMathDelimiters(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^```/.test(line.trimStart())) {
      inCodeFence = !inCodeFence;
      result.push(line);
      continue;
    }
    if (inCodeFence) {
      result.push(line);
      continue;
    }
    result.push(
      line
        .replace(/\\\[/g, "$$")
        .replace(/\\\]/g, "$$")
        .replace(/\\\(/g, "$")
        .replace(/\\\)/g, "$")
    );
  }
  return result.join("\n");
}

const plugins = { code, math, mermaid, cjk };

interface ChatMessageProps {
  message: Message;
  isAnimating: boolean;
  isLoading: boolean;
  onEdit: (id: string, content: string) => void;
  onResend: (id: string, content: string) => Promise<void>;
  onRegenerate: (id: string) => Promise<void>;
}

function AssistantBubble({
  content,
  isAnimating,
}: {
  content: string;
  isAnimating: boolean;
}) {
  const displayed = useAnimatedText(content, isAnimating);
  const isRevealing = displayed.length < content.length;

  return (
    <div className="prose dark:prose-invert max-w-none text-sm">
      {displayed ? (
        <Streamdown
          plugins={plugins}
          isAnimating={isAnimating || isRevealing}
        >
          {convertMathDelimiters(displayed)}
        </Streamdown>
      ) : isAnimating ? (
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="animate-pulse">Thinking...</span>
        </div>
      ) : null}
    </div>
  );
}

function EditableUserMessage({
  message,
  isLoading,
  onEdit,
  onResend,
}: {
  message: Message;
  isLoading: boolean;
  onEdit: (id: string, content: string) => void;
  onResend: (id: string, content: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    setDraft(message.content);
    setEditing(true);
  }, [message.content]);

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  const save = useCallback(() => {
    onEdit(message.id, draft);
    setEditing(false);
  }, [message.id, draft, onEdit]);

  const resend = useCallback(() => {
    onResend(message.id, draft);
    setEditing(false);
  }, [message.id, draft, onResend]);

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-20 w-full resize-none text-sm"
        />
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={save}>
            Save
          </Button>
          <Button size="sm" onClick={resend} disabled={!draft.trim() || isLoading}>
            Resend
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/msg flex flex-col items-end gap-1">
      <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-primary-foreground text-sm whitespace-pre-wrap">
        {message.content}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="opacity-0 transition-opacity group-hover/msg:opacity-100"
        onClick={startEdit}
        disabled={isLoading}
      >
        <Pencil className="size-3" />
      </Button>
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isAnimating,
  isLoading,
  onEdit,
  onResend,
  onRegenerate,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "px-4 py-4",
        isUser && "flex justify-end"
      )}
    >
      <div
        className={cn(
          "min-w-0 max-w-[85%]",
          isUser && "flex flex-col items-end"
        )}
      >
        {isUser ? (
          <EditableUserMessage
            message={message}
            isLoading={isLoading}
            onEdit={onEdit}
            onResend={onResend}
          />
        ) : (
          <div className="group/msg">
            <AssistantBubble content={message.content} isAnimating={isAnimating} />
            {!isAnimating && message.content && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="mt-1 opacity-0 transition-opacity group-hover/msg:opacity-100"
                onClick={() => onRegenerate(message.id)}
                disabled={isLoading}
              >
                <RotateCcw className="size-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
