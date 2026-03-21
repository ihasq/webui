import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Conversation } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Copy,
  Moon,
  Sun,
  MessageSquare,
  PanelLeftClose,
  History,
  EllipsisVertical,
} from "lucide-react";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isDark: boolean;
  onToggleDark: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

/** Text that scrolls left when `hovering` is true and content overflows */
function MarqueeText({ text, hovering }: { text: string; hovering: boolean }) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    if (!hovering) {
      cancelAnimationFrame(rafRef.current);
      inner.style.transform = "translateX(0)";
      return;
    }

    const outer = outerRef.current;
    if (!outer) return;
    const distance = inner.scrollWidth - outer.clientWidth;
    if (distance <= 0) return;

    const speed = 30; // px per second
    const duration = (distance / speed) * 1000;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      inner.style.transform = `translateX(${-distance * progress}px)`;
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [hovering, text]);

  return (
    <span ref={outerRef} className="block overflow-hidden">
      <span
        ref={innerRef}
        className="inline-block whitespace-nowrap transition-none"
      >
        {text}
      </span>
    </span>
  );
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/50"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
        onClick={onSelect}
      >
        <MessageSquare className="size-3.5 shrink-0 opacity-50" />
        <span className="min-w-0 flex-1 overflow-hidden">
          <MarqueeText text={conv.title} hovering={hovered} />
        </span>
      </button>

      {/* Absolutely positioned: gradient fade + menu trigger */}
      <div className="mobile-visible absolute inset-y-0 right-0 flex items-center">
        <div
          className={cn(
            "h-full w-6 bg-gradient-to-l to-transparent",
            isActive ? "from-sidebar-accent" : "from-sidebar"
          )}
        />
        <div
          className={cn(
            "flex items-center pr-1",
            isActive ? "bg-sidebar-accent" : "bg-sidebar"
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" />}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <EllipsisVertical className="size-3.5" />
            </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <Copy className="size-3.5" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive-foreground"
          >
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onDuplicate,
  isDark,
  onToggleDark,
  isOpen,
  onToggleOpen,
}: SidebarProps) {
  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 768) {
      onToggleOpen();
    }
  };

  const handleNew = () => {
    onNew();
    closeSidebarOnMobile();
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    closeSidebarOnMobile();
  };

  return (
    <>
      {!isOpen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleOpen}
          className="fixed top-2 left-2 z-50"
        >
          <History className="size-4" />
        </Button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onToggleOpen}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 md:relative md:transition-[margin]",
          isOpen
            ? "translate-x-0 md:ml-0"
            : "-translate-x-full md:translate-x-0 md:-ml-64"
        )}
      >
        {/* Top */}
        <div className="flex shrink-0 items-center gap-1 border-b p-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2"
            onClick={handleNew}
          >
            <Plus className="size-4" />
            New chat
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleOpen}>
            <PanelLeftClose className="size-4" />
          </Button>
        </div>

        {/* Conversation list */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            <div className="grid gap-0.5">
              {conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={activeId === conv.id}
                  onSelect={() => handleSelect(conv.id)}
                  onDelete={() => onDelete(conv.id)}
                  onDuplicate={() => onDuplicate(conv.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom */}
        <div className="flex shrink-0 items-center gap-1 border-t p-2">
          <Button variant="ghost" size="icon" onClick={onToggleDark}>
            {isDark ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        </div>
      </aside>
    </>
  );
}
