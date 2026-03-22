import { memo, useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";
import "katex/dist/katex.min.css";
import type { Message } from "@/hooks/use-chat";
import { useAnimatedText } from "@/hooks/use-animated-text";
import { getCacheKey, getCachedHtml, setCachedHtml } from "@/hooks/use-rendered-cache";
import { decompressHtml } from "@/lib/html-compression";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Pencil, RotateCcw, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const math = createMathPlugin({ singleDollarTextMath: true });

/** Highlight matching text within a string */
function HighlightedText({ text, query }: { text: string; query?: string | null }) {
  if (!query) {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let lastIndex = 0;
  let matchIndex: number;

  while ((matchIndex = lowerText.indexOf(lowerQuery, lastIndex)) !== -1) {
    // Add text before match
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }
    // Add highlighted match
    parts.push(
      <mark key={matchIndex} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">
        {text.slice(matchIndex, matchIndex + query.length)}
      </mark>
    );
    lastIndex = matchIndex + query.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

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
  onCacheHtml?: (id: string, html: string) => void;
  searchHighlight?: string | null;
  onHighlightShown?: () => void;
}

function ReasoningBlock({
  reasoning,
  isAnimating,
}: {
  reasoning: string;
  isAnimating: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(isAnimating);
  const wasAnimatingRef = useRef(false);
  const displayed = useAnimatedText(reasoning, isAnimating);

  // Auto-expand while animating, collapse when animation ends
  useLayoutEffect(() => {
    if (isAnimating) {
      setIsExpanded(true);
      wasAnimatingRef.current = true;
    } else if (wasAnimatingRef.current) {
      // Thinking finished, collapse the block
      setIsExpanded(false);
      wasAnimatingRef.current = false;
    }
  }, [isAnimating]);

  return (
    <div className="mb-3 rounded-lg border bg-muted/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <span>Thinking{isAnimating ? "..." : ""}</span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="prose dark:prose-invert max-w-none text-sm text-muted-foreground">
            <Streamdown plugins={plugins} isAnimating={isAnimating}>
              {convertMathDelimiters(displayed)}
            </Streamdown>
          </div>
        </div>
      )}
    </div>
  );
}

/** Highlight matching text in a DOM element by wrapping matches in <mark> tags */
function highlightTextInElement(element: HTMLElement, query: string) {
  if (!query) return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  const lowerQuery = query.toLowerCase();

  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    const lowerText = text.toLowerCase();
    const matchIndex = lowerText.indexOf(lowerQuery);

    if (matchIndex === -1) continue;

    // Split the text node and wrap the match
    const before = text.slice(0, matchIndex);
    const match = text.slice(matchIndex, matchIndex + query.length);
    const after = text.slice(matchIndex + query.length);

    const parent = textNode.parentNode;
    if (!parent) continue;

    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));

    const mark = document.createElement("mark");
    mark.className = "bg-yellow-300 dark:bg-yellow-600 rounded px-0.5 search-highlight";
    mark.textContent = match;
    fragment.appendChild(mark);

    if (after) fragment.appendChild(document.createTextNode(after));

    parent.replaceChild(fragment, textNode);
  }
}

/** Remove all search highlights from an element */
function removeHighlightsFromElement(element: HTMLElement) {
  const marks = element.querySelectorAll("mark.search-highlight");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize(); // Merge adjacent text nodes
    }
  });
}

function AssistantBubble({
  messageId,
  content,
  reasoning,
  isAnimating,
  highlightQuery,
  storedHtml,
  onCacheHtml,
}: {
  messageId: string;
  content: string;
  reasoning?: string;
  isAnimating: boolean;
  highlightQuery?: string | null;
  /** Compressed HTML from v2 storage */
  storedHtml?: string;
  /** Callback to save compressed HTML to storage */
  onCacheHtml?: (id: string, html: string) => void;
}) {
  const displayed = useAnimatedText(content, isAnimating);
  const isRevealing = displayed.length < content.length;
  const isThinking = isAnimating && !content && !!reasoning;
  const contentRef = useRef<HTMLDivElement>(null);
  const hasCapturedRef = useRef(false);

  // Decompress stored HTML from v2 storage (async)
  const [decompressedHtml, setDecompressedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (storedHtml && !isAnimating) {
      decompressHtml(storedHtml).then(setDecompressedHtml);
    } else {
      setDecompressedHtml(null);
    }
  }, [storedHtml, isAnimating]);

  // Check in-memory cache for pre-rendered HTML (fallback for v1 messages)
  const cacheKey = useMemo(
    () => (!isAnimating && content && !storedHtml ? getCacheKey(messageId, content) : null),
    [messageId, content, isAnimating, storedHtml]
  );
  const memoryCachedHtml = cacheKey ? getCachedHtml(cacheKey) : undefined;

  // The HTML to render (prefer stored > memory cache > parse)
  const cachedHtml = decompressedHtml ?? memoryCachedHtml;

  // Memoize converted content to avoid recalculating on every render
  const convertedContent = useMemo(
    () => (displayed ? convertMathDelimiters(displayed) : ""),
    [displayed]
  );

  // Capture and save HTML after streaming completes (for v2 storage)
  useEffect(() => {
    if (
      !isAnimating &&
      !isRevealing &&
      !storedHtml &&
      !hasCapturedRef.current &&
      contentRef.current &&
      onCacheHtml
    ) {
      hasCapturedRef.current = true;
      // Wait for next frame to ensure render is complete
      requestAnimationFrame(() => {
        const html = contentRef.current?.innerHTML;
        if (html && html.length > 0) {
          // Save to in-memory cache as well
          if (cacheKey) {
            setCachedHtml(cacheKey, html);
          }
          // Notify parent to save to persistent storage
          onCacheHtml(messageId, html);
        }
      });
    }
  }, [isAnimating, isRevealing, storedHtml, messageId, onCacheHtml, cacheKey]);

  // Apply text highlighting after render
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // Remove existing highlights first
    removeHighlightsFromElement(el);

    // Apply new highlights if query exists
    if (highlightQuery) {
      highlightTextInElement(el, highlightQuery);
    }
  }, [highlightQuery, displayed, cachedHtml]);

  return (
    <div>
      {reasoning && (
        <ReasoningBlock reasoning={reasoning} isAnimating={isThinking} />
      )}
      <div ref={contentRef} className="prose dark:prose-invert max-w-none text-sm">
        {cachedHtml ? (
          // Use cached HTML - instant render
          <div dangerouslySetInnerHTML={{ __html: cachedHtml }} />
        ) : displayed ? (
          <Streamdown
            plugins={plugins}
            isAnimating={isAnimating || isRevealing}
          >
            {convertedContent}
          </Streamdown>
        ) : isAnimating && !reasoning ? (
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="animate-pulse">Thinking...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EditableUserMessage({
  message,
  isLoading,
  onEdit,
  onResend,
  searchHighlight,
}: {
  message: Message;
  isLoading: boolean;
  onEdit: (id: string, content: string) => void;
  onResend: (id: string, content: string) => Promise<void>;
  searchHighlight?: string | null;
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
      {message.attachments && message.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {message.attachments.map((a, i) =>
            a.mimeType.startsWith("image/") && a.dataUrl ? (
              <img
                key={i}
                src={a.dataUrl}
                alt={a.name}
                className="max-h-48 rounded-lg border object-cover"
              />
            ) : (
              <div
                key={i}
                className="rounded-lg border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
              >
                {a.name}
              </div>
            )
          )}
        </div>
      )}
      <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-primary-foreground text-sm whitespace-pre-wrap">
        <HighlightedText text={message.content} query={searchHighlight} />
      </div>
      <div className="flex gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          className="mobile-visible"
          onClick={() => {
            navigator.clipboard.writeText(message.content);
            toast("Copied", {
              action: {
                label: "OK",
                onClick: () => {},
              },
            });
          }}
        >
          <Copy className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="mobile-visible"
          onClick={startEdit}
          disabled={isLoading}
        >
          <Pencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="mobile-visible"
          onClick={() => onResend(message.id, message.content)}
          disabled={isLoading}
        >
          <RotateCcw className="size-3" />
        </Button>
      </div>
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
  onCacheHtml,
  searchHighlight,
  onHighlightShown,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const messageRef = useRef<HTMLDivElement>(null);
  const [highlightQuery, setHighlightQuery] = useState<string | null>(null);

  // Check if this message matches the search query
  const hasMatch = searchHighlight
    ? message.content.toLowerCase().includes(searchHighlight.toLowerCase())
    : false;

  // Scroll to first matching message and highlight it
  useEffect(() => {
    if (hasMatch && searchHighlight && messageRef.current) {
      setHighlightQuery(searchHighlight);
      messageRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      onHighlightShown?.();

      // Remove highlight after animation
      const timer = setTimeout(() => setHighlightQuery(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasMatch, searchHighlight, onHighlightShown]);

  return (
    <div
      ref={messageRef}
      className={cn(
        "px-4 py-4 transition-colors duration-500",
        isUser && "flex justify-end",
        highlightQuery && "bg-yellow-100 dark:bg-yellow-900/30"
      )}
    >
      <div
        className={cn(
          "min-w-0",
          isUser && "max-w-[85%] flex flex-col items-end"
        )}
      >
        {isUser ? (
          <EditableUserMessage
            message={message}
            isLoading={isLoading}
            onEdit={onEdit}
            onResend={onResend}
            searchHighlight={highlightQuery}
          />
        ) : (
          <div className="group/msg">
            <AssistantBubble
              messageId={message.id}
              content={message.content}
              reasoning={message.reasoning}
              isAnimating={isAnimating}
              highlightQuery={highlightQuery}
              storedHtml={message.cachedHtml}
              onCacheHtml={onCacheHtml}
            />
            {!isAnimating && message.content && (
              <div className="mt-1 flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mobile-visible"
                  onClick={() => onRegenerate(message.id)}
                  disabled={isLoading}
                >
                  <RotateCcw className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mobile-visible"
                  onClick={() => {
            navigator.clipboard.writeText(message.content);
            toast("Copied", {
              action: {
                label: "OK",
                onClick: () => {},
              },
            });
          }}
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
