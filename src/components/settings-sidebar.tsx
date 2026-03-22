import { useState, useCallback, useRef, useEffect, memo } from "react";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelRightClose, Bot, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { Agent } from "@/hooks/use-agents";
import { ConfigEditor } from "@/components/config-editor";
import type { ChatConfig } from "@/hooks/use-chat";
import { defaultParams } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

// ============================================
// AgentItem Component (isolated state for editing)
// ============================================

interface AgentItemProps {
  agent: Agent;
  isActive: boolean;
  onSelect: (agent: Agent) => void;
  onUpdateName: (id: string, nickname: string) => void;
  onDelete: (id: string) => void;
  autoEditName?: boolean;
  onAutoEditComplete?: () => void;
}

const AgentItem = memo(function AgentItem({
  agent,
  isActive,
  onSelect,
  onUpdateName,
  onDelete,
  autoEditName,
  onAutoEditComplete,
}: AgentItemProps) {
  const [isEditing, setIsEditing] = useState(autoEditName ?? false);
  const [nameValue, setNameValue] = useState(agent.nickname);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle autoEditName prop change
  useEffect(() => {
    if (autoEditName) {
      setIsEditing(true);
      setNameValue(agent.nickname);
    }
  }, [autoEditName, agent.nickname]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNameValue(agent.nickname);
    setIsEditing(true);
  }, [agent.nickname]);

  const handleSave = useCallback(() => {
    if (nameValue.trim()) {
      onUpdateName(agent.id, nameValue.trim());
    }
    setIsEditing(false);
    onAutoEditComplete?.();
  }, [agent.id, nameValue, onUpdateName, onAutoEditComplete]);

  const handleCancel = useCallback(() => {
    setNameValue(agent.nickname);
    setIsEditing(false);
    onAutoEditComplete?.();
  }, [agent.nickname, onAutoEditComplete]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(agent.id);
  }, [agent.id, onDelete]);

  const handleSelect = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(agent);
  }, [agent, onSelect]);

  return (
    <div
      className={cn(
        "group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm",
        isActive ? "bg-accent" : "hover:bg-accent/50"
      )}
      onMouseDown={isEditing ? undefined : handleSelect}
    >
      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Bot className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-muted-foreground">@</span>
          <Input
            ref={inputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="h-6 min-w-0 flex-1 px-1 py-0 text-sm"
          />
          <Button variant="ghost" size="icon-xs" onClick={handleSave}>
            <Check className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={handleCancel}>
            <X className="size-3" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Bot className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">@{agent.nickname}</span>
          </div>
          <div className={cn(
            "flex shrink-0 items-center gap-0.5",
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}>
            <Button variant="ghost" size="icon-xs" onMouseDown={handleStartEdit}>
              <Pencil className="size-3" />
            </Button>
            <Button variant="ghost" size="icon-xs" onMouseDown={handleDelete}>
              <Trash2 className="size-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================
// ActiveAgentBadge Component
// ============================================

interface ActiveAgentBadgeProps {
  agent: Agent;
  onClear: () => void;
}

const ActiveAgentBadge = memo(function ActiveAgentBadge({
  agent,
  onClear,
}: ActiveAgentBadgeProps) {
  return (
    <div className="flex items-center justify-between rounded-md bg-accent/50 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">@{agent.nickname}</span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onClear}
        title="Clear active agent"
      >
        <X className="size-3" />
      </Button>
    </div>
  );
});

// ============================================
// AgentList Component
// ============================================

interface AgentListProps {
  agents: Agent[];
  activeAgentId: string | null;
  newAgentId: string | null;
  onSelect: (agent: Agent) => void;
  onUpdateName: (id: string, nickname: string) => void;
  onDelete: (id: string) => void;
  onNewAgentEditComplete: () => void;
}

const AgentList = memo(function AgentList({
  agents,
  activeAgentId,
  newAgentId,
  onSelect,
  onUpdateName,
  onDelete,
  onNewAgentEditComplete,
}: AgentListProps) {
  if (agents.length === 0) {
    return (
      <p className="text-center text-xs text-muted-foreground py-2">
        No agents configured. Click + to create one.
      </p>
    );
  }

  return (
    <div className="grid gap-1">
      {agents.map((agent) => (
        <AgentItem
          key={agent.id}
          agent={agent}
          isActive={activeAgentId === agent.id}
          onSelect={onSelect}
          onUpdateName={onUpdateName}
          onDelete={onDelete}
          autoEditName={newAgentId === agent.id}
          onAutoEditComplete={onNewAgentEditComplete}
        />
      ))}
    </div>
  );
});

// ============================================
// SettingsSidebar Component
// ============================================

interface SettingsSidebarProps {
  config: ChatConfig;
  onChange: (config: ChatConfig) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  width: number;
  onResizeEnd: (newWidth: number) => void;
  activeAgentId: string | null;
  onAgentSelect: (agent: Agent | null) => void;
  agents: Agent[];
  onCreateAgent: (agent: Omit<Agent, "id" | "createdAt">) => string;
  onUpdateAgent: (id: string, updates: Partial<Omit<Agent, "id" | "createdAt">>) => void;
  onDeleteAgent: (id: string) => void;
  getAgent: (id: string) => Agent | undefined;
}

export const SettingsSidebar = memo(function SettingsSidebar({
  config,
  onChange,
  isOpen,
  onToggleOpen,
  width,
  onResizeEnd,
  activeAgentId,
  onAgentSelect,
  agents,
  onCreateAgent,
  onUpdateAgent,
  onDeleteAgent,
  getAgent,
}: SettingsSidebarProps) {
  const [newAgentId, setNewAgentId] = useState<string | null>(null);

  // Local optimistic state for immediate UI feedback
  const [localActiveId, setLocalActiveId] = useState<string | null>(activeAgentId);

  // Sync local state when parent state changes
  useEffect(() => {
    setLocalActiveId(activeAgentId);
  }, [activeAgentId]);

  const activeAgent = localActiveId ? getAgent(localActiveId) : null;

  // Stable refs for callbacks
  const activeAgentIdRef = useRef(localActiveId);
  activeAgentIdRef.current = localActiveId;
  const onUpdateAgentRef = useRef(onUpdateAgent);
  onUpdateAgentRef.current = onUpdateAgent;

  const handleCreateAgent = useCallback(() => {
    const id = onCreateAgent({
      nickname: "new-agent",
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      model: config.model,
      params: { ...defaultParams },
    });
    setNewAgentId(id);
    // Select the new agent
    const newAgent = getAgent(id);
    if (newAgent) {
      onAgentSelect(newAgent);
    }
  }, [onCreateAgent, config.endpoint, config.apiKey, config.model, getAgent, onAgentSelect]);

  const handleSelectAgent = useCallback(
    (agent: Agent) => {
      // Immediate local update for instant UI feedback
      setLocalActiveId(agent.id);
      // Then update parent state
      onAgentSelect(agent);
      onChange({
        endpoint: agent.endpoint,
        apiKey: agent.apiKey,
        model: agent.model,
        params: agent.params,
      });
    },
    [onChange, onAgentSelect]
  );

  const handleClearAgent = useCallback(() => {
    setLocalActiveId(null);
    onAgentSelect(null);
  }, [onAgentSelect]);

  // Use refs to stabilize callbacks
  const onDeleteAgentRef = useRef(onDeleteAgent);
  onDeleteAgentRef.current = onDeleteAgent;
  const onAgentSelectRef = useRef(onAgentSelect);
  onAgentSelectRef.current = onAgentSelect;

  const handleUpdateName = useCallback(
    (id: string, nickname: string) => {
      onUpdateAgentRef.current(id, { nickname });
    },
    []
  );

  const handleDeleteAgent = useCallback(
    (id: string) => {
      onDeleteAgentRef.current(id);
      if (activeAgentIdRef.current === id) {
        setLocalActiveId(null);
        onAgentSelectRef.current(null);
      }
    },
    []
  );

  const handleNewAgentEditComplete = useCallback(() => {
    setNewAgentId(null);
  }, []);

  // Stable callback that doesn't change when activeAgentId changes
  const handleConfigChange = useCallback(
    (newConfig: ChatConfig) => {
      onChange(newConfig);
      const currentAgentId = activeAgentIdRef.current;
      if (currentAgentId) {
        onUpdateAgentRef.current(currentAgentId, {
          endpoint: newConfig.endpoint,
          apiKey: newConfig.apiKey,
          model: newConfig.model,
          params: newConfig.params,
        });
      }
    },
    [onChange]
  );

  return (
    <>
      {/* Toggle button when closed */}
      {!isOpen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleOpen}
          className="fixed top-2 right-2 z-50"
        >
          <Bot className="size-4" />
        </Button>
      )}

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onToggleOpen}
        />
      )}

      {/* Sidebar */}
      <aside
        data-settings-sidebar-width
        data-closed={!isOpen}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-72 shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground transition-transform duration-200 md:relative md:transition-[margin]",
          isOpen
            ? "translate-x-0 md:mr-0"
            : "translate-x-full md:translate-x-0"
        )}
        style={{ "--settings-sidebar-width": `${width}px` } as React.CSSProperties}
      >
        <ResizeHandle side="right" width={width} onResizeEnd={onResizeEnd} />

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b p-2">
          <div className="flex items-center gap-2 px-2">
            <Bot className="size-4" />
            <span className="font-medium text-sm">Settings</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleOpen}>
            <PanelRightClose className="size-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid min-w-0 gap-5">
            {/* Agent Registry */}
            <fieldset className="grid min-w-0 gap-3">
              <div className="flex min-w-0 items-center justify-between">
                <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Agent Registry
                </legend>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCreateAgent}
                >
                  <Plus className="size-3" />
                </Button>
              </div>

              {activeAgent && (
                <ActiveAgentBadge agent={activeAgent} onClear={handleClearAgent} />
              )}

              <AgentList
                agents={agents}
                activeAgentId={localActiveId}
                newAgentId={newAgentId}
                onSelect={handleSelectAgent}
                onUpdateName={handleUpdateName}
                onDelete={handleDeleteAgent}
                onNewAgentEditComplete={handleNewAgentEditComplete}
              />
            </fieldset>

            <hr className="border-border" />

            {/* Config Editor */}
            <ConfigEditor
              config={config}
              onChange={handleConfigChange}
              showModelRegistry={true}
              showAdvancedToggle={false}
            />
          </div>
        </div>
      </aside>
    </>
  );
});
