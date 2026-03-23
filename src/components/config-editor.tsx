import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MarqueeText } from "@/components/ui/marquee-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, ChevronDown, ChevronUp, Search, ArrowLeft, Box, Server } from "lucide-react";
import type { ChatConfig, InferenceParams, ReasoningEffort } from "@/hooks/use-chat";
import { useModelsRegistry, type ProviderInfo, type ModelInfo } from "@/hooks/use-models-registry";
import { cn } from "@/lib/utils";

// ============================================
// NumberInput Component (with optimized slider)
// ============================================

function NumberInput({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  id: string;
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder: string;
}) {
  const hasRange = min !== undefined && max !== undefined;
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? min ?? 0);
  const rangeRef = useRef<HTMLInputElement>(null);

  // Touch gesture detection state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const gestureDecidedRef = useRef<"horizontal" | "vertical" | null>(null);
  const GESTURE_THRESHOLD = 10;

  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value ?? min ?? 0);
    }
  }, [value, min, isDragging]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    gestureDecidedRef.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || !rangeRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    if (!gestureDecidedRef.current) {
      if (deltaX > GESTURE_THRESHOLD || deltaY > GESTURE_THRESHOLD) {
        gestureDecidedRef.current = deltaX > deltaY ? "horizontal" : "vertical";
        if (gestureDecidedRef.current === "horizontal") {
          setIsDragging(true);
        }
      }
    }

    if (gestureDecidedRef.current === "horizontal") {
      e.preventDefault();
      const rect = rangeRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      const rangeMin = min ?? 0;
      const rangeMax = max ?? 100;
      const stepVal = step ?? 1;
      const rawValue = rangeMin + ratio * (rangeMax - rangeMin);
      const steppedValue = Math.round(rawValue / stepVal) * stepVal;
      const clampedValue = Math.max(rangeMin, Math.min(rangeMax, steppedValue));
      setLocalValue(clampedValue);
    }
  }, [min, max, step]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onChange(localValue);
    }
    touchStartRef.current = null;
    gestureDecidedRef.current = null;
  }, [isDragging, localValue, onChange]);

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <Label htmlFor={id} className="shrink-0">{label}</Label>
        <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
      </div>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={isDragging ? localValue : (value ?? "")}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
      />
      {hasRange && (
        <div
          className="px-2 touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <input
            ref={rangeRef}
            type="range"
            min={min}
            max={max}
            step={step}
            value={isDragging ? localValue : (value ?? min)}
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") {
                setIsDragging(true);
              }
            }}
            onInput={(e) => {
              if (isDragging || gestureDecidedRef.current === "horizontal") {
                const newValue = Number((e.target as HTMLInputElement).value);
                setLocalValue(newValue);
              }
            }}
            onPointerUp={(e) => {
              if (e.pointerType !== "touch" && isDragging) {
                setIsDragging(false);
                onChange(localValue);
              }
            }}
            onLostPointerCapture={(e) => {
              if (e.pointerType !== "touch" && isDragging) {
                setIsDragging(false);
                onChange(localValue);
              }
            }}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none pointer-events-auto touch-pan-y
              [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ring [&::-webkit-slider-thumb]:bg-white
              [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ring [&::-moz-range-thumb]:bg-white
              [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-primary"
          />
        </div>
      )}
    </div>
  );
}

// ============================================
// Model Search Types and Helpers
// ============================================

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

  const scored = [...groups.values()].map((g) => {
    const nameLower = g.name.toLowerCase();
    let score = 0;
    if (nameLower === q) score = 100;
    else if (nameLower.startsWith(q)) score = 80;
    else score = 60;
    score += Math.min(g.entries.length, 10);
    return { group: g, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map((s) => s.group);
}

// ============================================
// ModelSelectWithMarquee Component
// ============================================

function ModelSelectWithMarquee({
  value,
  models,
  onValueChange,
  disabled = false,
}: {
  value: string;
  models: { id: string; name: string; cost?: { input: number; output: number } }[];
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const selectedModel = models.find((m) => m.id === value);
  const displayText = disabled
    ? "Select a provider first"
    : selectedModel?.name || "Select a model...";

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label>Model</Label>
      <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          className="w-full min-w-0"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="relative min-w-0 flex-1 overflow-hidden text-left">
            <MarqueeText
              text={displayText}
              hovering={hovered}
              className={!selectedModel ? "text-muted-foreground" : ""}
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-input to-transparent dark:from-input/30" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
              {m.cost && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ${m.cost.input}/{m.cost.output}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================
// ConfigEditor Component
// ============================================

interface ConfigEditorProps {
  config: ChatConfig;
  onChange: (config: ChatConfig) => void;
  showModelRegistry?: boolean;
  showAdvancedToggle?: boolean;
}

export function ConfigEditor({
  config,
  onChange,
  showModelRegistry = true,
  showAdvancedToggle = false,
}: ConfigEditorProps) {
  const { providers, providerMap, loading, error, refresh } = useModelsRegistry();
  const [showAdvanced, setShowAdvanced] = useState(!showAdvancedToggle);

  // Track if endpoint was manually edited (vs selected from registry)
  const [isCustomEndpoint, setIsCustomEndpoint] = useState(false);

  // Search mode state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [searchSelectedGroup, setSearchSelectedGroup] = useState<ModelGroup | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(
    () => searchModels(searchQuery, providers),
    [searchQuery, providers],
  );

  // Focus input when entering search mode
  useEffect(() => {
    if (searchMode && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchMode]);

  // Derive selectedProvider and currentProvider directly from config.endpoint (no extra render cycle)
  const currentProvider = useMemo(() => {
    // If endpoint was manually edited, don't match against registry
    if (isCustomEndpoint) return undefined;
    return providers.find((p) => p.api === config.endpoint);
  }, [providers, config.endpoint, isCustomEndpoint]);

  const selectedProvider = isCustomEndpoint ? "custom" : (currentProvider?.id ?? "");

  const updateParams = useCallback(
    (patch: Partial<InferenceParams>) => {
      onChange({ ...config, params: { ...config.params, ...patch } });
    },
    [config, onChange]
  );

  const handleProviderChange = useCallback(
    (providerId: string | null) => {
      if (!providerId) return;
      if (providerId === "custom") {
        setIsCustomEndpoint(true);
        return;
      }
      const provider = providerMap.get(providerId);
      if (provider?.api) {
        setIsCustomEndpoint(false);
        onChange({ ...config, endpoint: provider.api, model: "" });
      }
    },
    [providerMap, onChange, config]
  );

  const handleModelChange = useCallback(
    (modelId: string | null) => {
      if (!modelId) return;
      onChange({ ...config, model: modelId });
    },
    [onChange, config]
  );

  const handleModelSearchSelect = useCallback(
    (provider: ProviderInfo, model: { id: string }) => {
      if (provider.api) {
        setIsCustomEndpoint(false);
        onChange({ ...config, endpoint: provider.api, model: model.id });
      }
      // Close search mode after selection
      setSearchMode(false);
      setSearchQuery("");
      setSearchSelectedGroup(null);
      setSearchActiveIndex(-1);
    },
    [onChange, config]
  );

  const handleSearchSelectModel = useCallback(
    (group: ModelGroup) => {
      // Autocomplete the search input with the model name
      setSearchQuery(group.name);
      if (group.entries.length === 1) {
        // Only one provider — select directly
        const { provider, model } = group.entries[0];
        handleModelSearchSelect(provider, model);
      } else {
        // Multiple providers — show provider picker
        setSearchSelectedGroup(group);
        setSearchActiveIndex(-1);
      }
    },
    [handleModelSearchSelect],
  );

  const handleSearchSelectProvider = useCallback(
    (entry: { provider: ProviderInfo; model: ModelInfo }) => {
      handleModelSearchSelect(entry.provider, entry.model);
    },
    [handleModelSearchSelect],
  );

  const searchItemCount = searchSelectedGroup
    ? searchSelectedGroup.entries.length
    : searchResults.length;

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (searchItemCount === 0 && e.key !== "Escape") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchActiveIndex((i) => Math.min(i + 1, searchItemCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && searchActiveIndex >= 0) {
      e.preventDefault();
      if (searchSelectedGroup) {
        handleSearchSelectProvider(searchSelectedGroup.entries[searchActiveIndex]);
      } else {
        handleSearchSelectModel(searchResults[searchActiveIndex]);
      }
    } else if (e.key === "Escape") {
      if (searchSelectedGroup) {
        setSearchSelectedGroup(null);
        setSearchActiveIndex(-1);
      } else {
        setSearchMode(false);
        setSearchQuery("");
      }
    } else if (e.key === "Backspace" && searchSelectedGroup && searchQuery === "") {
      setSearchSelectedGroup(null);
      setSearchActiveIndex(-1);
    }
  }, [searchItemCount, searchActiveIndex, searchSelectedGroup, searchResults, searchQuery, handleSearchSelectModel, handleSearchSelectProvider]);

  const handleExitSearchMode = useCallback(() => {
    setSearchMode(false);
    setSearchQuery("");
    setSearchSelectedGroup(null);
    setSearchActiveIndex(-1);
  }, []);

  return (
    <div className="grid min-w-0 gap-4">
      {/* Model Registry */}
      {showModelRegistry && (
        <>
          <fieldset className="grid min-w-0 gap-3">
            <div className="flex min-w-0 items-center justify-between gap-1">
              {searchMode ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleExitSearchMode}
                    className="shrink-0"
                  >
                    <ArrowLeft className="size-3" />
                  </Button>
                  <div ref={searchContainerRef} className="relative min-w-0 flex-1">
                    <Input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSearchSelectedGroup(null);
                        setSearchActiveIndex(-1);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search models..."
                      className="h-7 text-sm"
                    />
                    {(searchSelectedGroup || searchResults.length > 0) && (
                      <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                        {searchSelectedGroup ? (
                          <>
                            <button
                              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/50"
                              onClick={() => {
                                setSearchSelectedGroup(null);
                                setSearchActiveIndex(-1);
                              }}
                            >
                              <ArrowLeft className="size-3" />
                              Back
                            </button>
                            <div className="px-2 pt-1 pb-1.5 text-xs font-medium">
                              {searchSelectedGroup.name}
                              <span className="ml-1 text-muted-foreground">
                                — select provider
                              </span>
                            </div>
                            {searchSelectedGroup.entries.map((entry, i) => (
                              <button
                                key={`${entry.provider.id}-${entry.model.id}`}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                                  searchActiveIndex === i
                                    ? "bg-accent text-accent-foreground"
                                    : "hover:bg-accent/50",
                                )}
                                onMouseEnter={() => setSearchActiveIndex(i)}
                                onClick={() => handleSearchSelectProvider(entry)}
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
                          searchResults.map((group, i) => (
                            <button
                              key={group.name}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                                searchActiveIndex === i
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent/50",
                              )}
                              onMouseEnter={() => setSearchActiveIndex(i)}
                              onClick={() => handleSearchSelectModel(group)}
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
                </>
              ) : (
                <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Model Registry
                </legend>
              )}
              <div className="flex shrink-0 items-center gap-0.5">
                {!searchMode && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setSearchMode(true)}
                  >
                    <Search className="size-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={refresh}
                  disabled={loading}
                >
                  <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive-foreground">
                Failed to load: {error}
              </p>
            )}

            <div className="grid min-w-0 gap-1.5">
              <Label>Provider</Label>
              <Select value={selectedProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Select a provider..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ModelSelectWithMarquee
              value={config.model}
              models={currentProvider?.models ?? []}
              onValueChange={handleModelChange}
              disabled={!currentProvider || isCustomEndpoint}
            />
          </fieldset>

          <hr className="border-border" />
        </>
      )}

      {/* Connection */}
      <fieldset className="grid min-w-0 gap-3">
        <legend className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Connection
        </legend>
        <div className="grid gap-1.5">
          <Label htmlFor="cfg-endpoint">API Endpoint</Label>
          <Input
            id="cfg-endpoint"
            placeholder="http://localhost:11434/v1"
            value={config.endpoint}
            onChange={(e) => {
              setIsCustomEndpoint(true);
              onChange({ ...config, endpoint: e.target.value });
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cfg-apiKey">API Key</Label>
          <Input
            id="cfg-apiKey"
            type="password"
            placeholder="sk-..."
            value={config.apiKey}
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cfg-model">Model</Label>
          <Input
            id="cfg-model"
            placeholder="gpt-4o"
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
          />
        </div>
      </fieldset>

      <hr className="border-border" />

      {/* System Prompt */}
      <fieldset className="grid min-w-0 gap-3">
        <legend className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          System Prompt
        </legend>
        <Textarea
          id="cfg-systemPrompt"
          placeholder="You are a helpful assistant."
          value={config.params.systemPrompt}
          onChange={(e) => updateParams({ systemPrompt: e.target.value })}
          rows={3}
          className="min-h-20"
        />
      </fieldset>

      <hr className="border-border" />

      {/* Inference Parameters */}
      <fieldset className="grid min-w-0 gap-3">
        {showAdvancedToggle ? (
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            Inference Parameters
          </button>
        ) : (
          <legend className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Inference Parameters
          </legend>
        )}

        {showAdvanced && (
          <div className={`grid gap-3 ${showAdvancedToggle ? "rounded-md border p-3" : ""}`}>
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="cfg-reasoningEffort">Reasoning Effort</Label>
                <span className="text-xs text-muted-foreground">for o1/o3 models</span>
              </div>
              <Select
                value={config.params.reasoningEffort ?? ""}
                onValueChange={(v) =>
                  updateParams({
                    reasoningEffort: v === "" ? null : (v as ReasoningEffort),
                  })
                }
              >
                <SelectTrigger id="cfg-reasoningEffort" className="w-full">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Default</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumberInput
              id="cfg-temperature"
              label="Temperature"
              hint="0 – 2"
              value={config.params.temperature}
              onChange={(v) => updateParams({ temperature: v })}
              min={0}
              max={2}
              step={0.1}
              placeholder="Default"
            />
            <NumberInput
              id="cfg-topP"
              label="Top P"
              hint="0 – 1"
              value={config.params.topP}
              onChange={(v) => updateParams({ topP: v })}
              min={0}
              max={1}
              step={0.05}
              placeholder="Default"
            />
            <NumberInput
              id="cfg-topK"
              label="Top K"
              hint="integer"
              value={config.params.topK}
              onChange={(v) => updateParams({ topK: v })}
              min={0}
              step={1}
              placeholder="Default"
            />
            <NumberInput
              id="cfg-maxTokens"
              label="Max Tokens"
              hint="integer"
              value={config.params.maxTokens}
              onChange={(v) => updateParams({ maxTokens: v })}
              min={1}
              step={1}
              placeholder="Default"
            />
            <NumberInput
              id="cfg-frequencyPenalty"
              label="Frequency Penalty"
              hint="-2 – 2"
              value={config.params.frequencyPenalty}
              onChange={(v) => updateParams({ frequencyPenalty: v })}
              min={-2}
              max={2}
              step={0.1}
              placeholder="Default"
            />
            <NumberInput
              id="cfg-presencePenalty"
              label="Presence Penalty"
              hint="-2 – 2"
              value={config.params.presencePenalty}
              onChange={(v) => updateParams({ presencePenalty: v })}
              min={-2}
              max={2}
              step={0.1}
              placeholder="Default"
            />
            <NumberInput
              id="cfg-seed"
              label="Seed"
              hint="integer"
              value={config.params.seed}
              onChange={(v) => updateParams({ seed: v })}
              step={1}
              placeholder="Default"
            />
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="cfg-stop">Stop Sequences</Label>
                <span className="text-xs text-muted-foreground">comma-separated</span>
              </div>
              <Input
                id="cfg-stop"
                placeholder="e.g. \n, END"
                value={config.params.stop}
                onChange={(e) => updateParams({ stop: e.target.value })}
              />
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
