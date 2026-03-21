import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Box, ArrowLeft, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProviderInfo, ModelInfo } from "@/hooks/use-models-registry";

interface ModelSearchProps {
  providers: ProviderInfo[];
  onSelect: (provider: ProviderInfo, model: ModelInfo) => void;
}

interface ModelGroup {
  name: string;
  entries: { provider: ProviderInfo; model: ModelInfo }[];
}

function searchModels(
  query: string,
  providers: ProviderInfo[],
): ModelGroup[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Collect all matching models, grouped by display name
  const groups = new Map<string, ModelGroup>();

  for (const provider of providers) {
    for (const model of provider.models) {
      if (
        model.name.toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q)
      ) {
        const key = model.name;
        if (!groups.has(key)) {
          groups.set(key, { name: key, entries: [] });
        }
        groups.get(key)!.entries.push({ provider, model });
      }
    }
  }

  // Score and sort groups
  const scored = [...groups.values()].map((g) => {
    const nameLower = g.name.toLowerCase();
    let score = 0;
    if (nameLower === q) score = 100;
    else if (nameLower.startsWith(q)) score = 80;
    else score = 60;
    // Popularity tiebreaker: more providers = more popular
    score += Math.min(g.entries.length, 10);
    return { group: g, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map((s) => s.group);
}

export function ModelSearch({ providers, onSelect }: ModelSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedGroup, setSelectedGroup] = useState<ModelGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchModels(query, providers),
    [query, providers],
  );

  // Close on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(e.target as Node)
    ) {
      setOpen(false);
      setSelectedGroup(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [handleOutsideClick]);

  const handleSelectModel = useCallback(
    (group: ModelGroup) => {
      if (group.entries.length === 1) {
        // Only one provider — select directly
        const { provider, model } = group.entries[0];
        onSelect(provider, model);
        setQuery("");
        setOpen(false);
        setSelectedGroup(null);
        setActiveIndex(-1);
      } else {
        // Multiple providers — show provider picker
        setSelectedGroup(group);
        setActiveIndex(-1);
      }
    },
    [onSelect],
  );

  const handleSelectProvider = useCallback(
    (entry: { provider: ProviderInfo; model: ModelInfo }) => {
      onSelect(entry.provider, entry.model);
      setQuery("");
      setOpen(false);
      setSelectedGroup(null);
      setActiveIndex(-1);
    },
    [onSelect],
  );

  const itemCount = selectedGroup
    ? selectedGroup.entries.length
    : results.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || itemCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, itemCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      if (selectedGroup) {
        handleSelectProvider(selectedGroup.entries[activeIndex]);
      } else {
        handleSelectModel(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (selectedGroup) {
        setSelectedGroup(null);
        setActiveIndex(-1);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Backspace" && selectedGroup && query === "") {
      setSelectedGroup(null);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative grid min-w-0 gap-1.5">
      <Label>Search Models</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setSelectedGroup(null);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (query || selectedGroup) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search models..."
          className="pl-8"
        />
      </div>

      {open && (selectedGroup || results.length > 0) && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {selectedGroup ? (
            <>
              <button
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/50"
                onClick={() => {
                  setSelectedGroup(null);
                  setActiveIndex(-1);
                }}
              >
                <ArrowLeft className="size-3" />
                Back
              </button>
              <div className="px-2 pt-1 pb-1.5 text-xs font-medium">
                {selectedGroup.name}
                <span className="ml-1 text-muted-foreground">
                  — select provider
                </span>
              </div>
              {selectedGroup.entries.map((entry, i) => (
                <button
                  key={`${entry.provider.id}-${entry.model.id}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    activeIndex === i
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => handleSelectProvider(entry)}
                >
                  <Server className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{entry.provider.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {entry.model.id}
                    {entry.model.cost && (
                      <> · ${entry.model.cost.input}/{entry.model.cost.output}</>
                    )}
                  </span>
                </button>
              ))}
            </>
          ) : (
            results.map((group, i) => (
              <button
                key={group.name}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  activeIndex === i
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => handleSelectModel(group)}
              >
                <Box className="size-3.5 shrink-0 text-muted-foreground" />
                <span>{group.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {group.entries.length === 1
                    ? group.entries[0].provider.name
                    : `${group.entries.length} providers`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
