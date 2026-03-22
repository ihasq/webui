import { useRef, useState } from "react";
import { MarqueeText } from "@/components/ui/marquee-text";
import { ResizeHandle } from "@/components/ui/resize-handle";
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
  Search,
  ArrowLeft,
  Pin,
  PinOff,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string, searchQuery?: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onTogglePin: (id: string) => void;
  isDark: boolean;
  onToggleDark: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  width: number;
  onResizeEnd: (newWidth: number) => void;
}


function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onDuplicate,
  onTogglePin,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
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
        {conv.pinned ? (
          <Pin className="size-3.5 shrink-0 opacity-50" />
        ) : (
          <MessageSquare className="size-3.5 shrink-0 opacity-50" />
        )}
        <span className="min-w-0 flex-1 overflow-hidden">
          <MarqueeText text={conv.title} hovering={hovered} />
        </span>
      </button>

      {/* Absolutely positioned: gradient fade + menu trigger */}
      <div className="mobile-visible absolute inset-y-0 right-0 flex items-center">
        <div
          className={cn(
            "h-full w-6 bg-gradient-to-l to-transparent",
            isActive
              ? "from-sidebar-accent"
              : hovered
                ? "from-sidebar-accent/50"
                : "from-sidebar"
          )}
        />
        <div
          className={cn(
            "flex h-full items-center pr-1",
            isActive
              ? "bg-sidebar-accent"
              : hovered
                ? "bg-sidebar-accent/50"
                : "bg-sidebar"
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(props) => (
                <Button
                  {...props}
                  variant="ghost"
                  size="icon-xs"
                  className="hover:bg-transparent dark:hover:bg-transparent"
                />
              )}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <EllipsisVertical className="size-3.5" />
            </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
          >
            {conv.pinned ? (
              <>
                <PinOff className="size-3.5" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="size-3.5" />
                Pin
              </>
            )}
          </DropdownMenuItem>
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
  onTogglePin,
  isDark,
  onToggleDark,
  isOpen,
  onToggleOpen,
  width,
  onResizeEnd,
}: SidebarProps) {
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 768) {
      onToggleOpen();
    }
  };

  const handleNew = () => {
    onNew();
    setSearchMode(false);
    setSearchQuery("");
    closeSidebarOnMobile();
  };

  const handleSelect = (id: string) => {
    onSelect(id, searchQuery || undefined);
    setSearchMode(false);
    setSearchQuery("");
    closeSidebarOnMobile();
  };

  const enterSearchMode = () => {
    setSearchMode(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const exitSearchMode = () => {
    setSearchMode(false);
    setSearchQuery("");
  };

  // Filter conversations based on search query
  const filteredConversations = searchQuery
    ? conversations.filter((conv) =>
        conv.messages.some((msg) =>
          msg.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : conversations;

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
        data-sidebar-width
        data-closed={!isOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 md:relative md:transition-[margin]",
          isOpen
            ? "translate-x-0 md:ml-0"
            : "-translate-x-full md:translate-x-0"
        )}
        style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      >
        <ResizeHandle side="left" width={width} onResizeEnd={onResizeEnd} />
        {/* Top */}
        <div className="flex shrink-0 items-center gap-1 border-b p-2">
          <Button variant="ghost" size="icon" onClick={onToggleOpen}>
            <PanelLeftClose className="size-4" />
          </Button>
          {searchMode ? (
            <>
              <Button variant="ghost" size="icon" onClick={exitSearchMode}>
                <ArrowLeft className="size-4" />
              </Button>
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 flex-1"
              />
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={handleNew}>
                <Plus className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={enterSearchMode}>
                <Search className="size-4" />
              </Button>
            </>
          )}
        </div>

        {/* Conversation list */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
          {filteredConversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {searchQuery ? "No matching conversations" : "No conversations yet"}
            </p>
          ) : (
            <div className="grid gap-0.5">
              {filteredConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={activeId === conv.id}
                  onSelect={() => handleSelect(conv.id)}
                  onDelete={() => onDelete(conv.id)}
                  onDuplicate={() => onDuplicate(conv.id)}
                  onTogglePin={() => onTogglePin(conv.id)}
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
