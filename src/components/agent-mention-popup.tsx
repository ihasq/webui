import { useEffect, useRef, useState } from "react";
import type { Agent } from "@/hooks/use-agents";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentMentionPopupProps {
  agents: Agent[];
  query: string;
  onSelect: (agent: Agent) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function AgentMentionPopup({
  agents,
  query,
  onSelect,
  onClose,
  anchorRef,
}: AgentMentionPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Filter agents based on query
  const filteredAgents = query
    ? agents.filter((a) =>
        a.nickname.toLowerCase().includes(query.toLowerCase())
      )
    : agents;

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const item = itemRefs.current[selectedIndex];
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredAgents.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filteredAgents.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) =>
            i <= 0 ? filteredAgents.length - 1 : i - 1
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (filteredAgents[selectedIndex]) {
            onSelect(filteredAgents[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filteredAgents, selectedIndex, onSelect, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, anchorRef]);

  if (filteredAgents.length === 0) {
    return (
      <div
        ref={popupRef}
        className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-lg"
      >
        {query ? `No agents matching "${query}"` : "No agents configured"}
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      className="absolute bottom-full left-0 mb-2 max-h-48 w-64 overflow-y-auto rounded-lg border bg-popover shadow-lg"
    >
      <div className="p-1">
        {filteredAgents.map((agent, index) => (
          <button
            key={agent.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              selectedIndex === index
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
            onClick={() => onSelect(agent)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <Bot className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{agent.nickname}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
