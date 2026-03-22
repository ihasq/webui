import { useState, useEffect, useCallback } from "react";
import { MarqueeText } from "@/components/ui/marquee-text";
import { ResizeHandle } from "@/components/ui/resize-handle";
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
import { RefreshCw, PanelRightClose, Bot } from "lucide-react";
import type { ChatConfig, InferenceParams, ReasoningEffort } from "@/hooks/use-chat";
import { useModelsRegistry, type ProviderInfo } from "@/hooks/use-models-registry";
import { ModelSearch } from "@/components/model-search";
import { cn } from "@/lib/utils";

interface SettingsSidebarProps {
  config: ChatConfig;
  onChange: (config: ChatConfig) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  width: number;
  onResizeEnd: (newWidth: number) => void;
}

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
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
      />
      {hasRange && (
        <div className="px-2">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value ?? min}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none
              [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ring [&::-webkit-slider-thumb]:bg-white
              [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ring [&::-moz-range-thumb]:bg-white
              [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-primary"
          />
        </div>
      )}
    </div>
  );
}

function ModelSelectWithMarquee({
  value,
  models,
  onValueChange,
}: {
  value: string;
  models: { id: string; name: string; cost?: { input: number; output: number } }[];
  onValueChange: (value: string | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const selectedModel = models.find((m) => m.id === value);
  const displayText = selectedModel?.name || "Select a model...";

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label>Model</Label>
      <Select value={value || undefined} onValueChange={onValueChange}>
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
            {/* Gradient fade */}
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

function ProviderModelSelector({
  config,
  onChange,
}: {
  config: ChatConfig;
  onChange: (config: ChatConfig) => void;
}) {
  const { providers, providerMap, loading, error, refresh } =
    useModelsRegistry();
  const [selectedProvider, setSelectedProvider] = useState("");

  // Sync selectedProvider with config.endpoint
  useEffect(() => {
    const matchingProvider = providers.find((p) => p.api === config.endpoint);
    if (matchingProvider) {
      setSelectedProvider(matchingProvider.id);
    } else if (selectedProvider && providerMap.get(selectedProvider)?.api !== config.endpoint) {
      // Endpoint was manually changed to something not matching any provider
      setSelectedProvider("");
    }
  }, [config.endpoint, providers, providerMap, selectedProvider]);

  const currentProvider: ProviderInfo | undefined =
    providerMap.get(selectedProvider);

  const handleProviderChange = useCallback((providerId: string | null) => {
    if (!providerId) return;
    setSelectedProvider(providerId);
    const provider = providerMap.get(providerId);
    if (provider?.api) {
      onChange({ ...config, endpoint: provider.api, model: "" });
    }
  }, [providerMap, onChange, config]);

  const handleModelChange = useCallback((modelId: string | null) => {
    if (!modelId) return;
    onChange({ ...config, model: modelId });
  }, [onChange, config]);

  return (
    <fieldset className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center justify-between">
        <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Model Registry
        </legend>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            className={`size-3 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive-foreground">
          Failed to load: {error}
        </p>
      )}

      <ModelSearch
        providers={providers}
        onSelect={(provider, model) => {
          setSelectedProvider(provider.id);
          if (provider.api) {
            onChange({ ...config, endpoint: provider.api, model: model.id });
          }
        }}
      />

      <div className="grid min-w-0 gap-1.5">
        <Label>Provider</Label>
        <Select
          value={selectedProvider}
          onValueChange={handleProviderChange}
        >
          <SelectTrigger className="w-full min-w-0">
            <SelectValue placeholder="Select a provider..." />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {currentProvider && (
        <ModelSelectWithMarquee
          value={config.model}
          models={currentProvider.models}
          onValueChange={handleModelChange}
        />
      )}
    </fieldset>
  );
}

export function SettingsSidebar({
  config,
  onChange,
  isOpen,
  onToggleOpen,
  width,
  onResizeEnd,
}: SettingsSidebarProps) {
  const updateParams = (patch: Partial<InferenceParams>) =>
    onChange({ ...config, params: { ...config.params, ...patch } });

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
            {/* Model Registry */}
            <ProviderModelSelector config={config} onChange={onChange} />

            <hr className="border-border" />

            {/* Connection (manual / override) */}
            <fieldset className="grid min-w-0 gap-3">
              <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Connection
              </legend>
              <div className="grid gap-1.5">
                <Label htmlFor="endpoint">API Endpoint</Label>
                <Input
                  id="endpoint"
                  placeholder="http://localhost:11434/v1"
                  value={config.endpoint}
                  onChange={(e) =>
                    onChange({ ...config, endpoint: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="sk-..."
                  value={config.apiKey}
                  onChange={(e) =>
                    onChange({ ...config, apiKey: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  placeholder="gpt-4o"
                  value={config.model}
                  onChange={(e) =>
                    onChange({ ...config, model: e.target.value })
                  }
                />
              </div>
            </fieldset>

            <hr className="border-border" />

            {/* System Prompt */}
            <fieldset className="grid min-w-0 gap-3">
              <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                System Prompt
              </legend>
              <Textarea
                id="systemPrompt"
                placeholder="You are a helpful assistant."
                value={config.params.systemPrompt}
                onChange={(e) =>
                  updateParams({ systemPrompt: e.target.value })
                }
                rows={3}
                className="min-h-20"
              />
            </fieldset>

            <hr className="border-border" />

            {/* Inference Parameters */}
            <fieldset className="grid min-w-0 gap-3">
              <legend className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Inference Parameters
              </legend>
              <NumberInput
                id="temperature"
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
                id="topP"
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
                id="topK"
                label="Top K"
                hint="integer"
                value={config.params.topK}
                onChange={(v) => updateParams({ topK: v })}
                min={0}
                step={1}
                placeholder="Default"
              />
              <NumberInput
                id="maxTokens"
                label="Max Tokens"
                hint="integer"
                value={config.params.maxTokens}
                onChange={(v) => updateParams({ maxTokens: v })}
                min={1}
                step={1}
                placeholder="Default"
              />
              <NumberInput
                id="frequencyPenalty"
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
                id="presencePenalty"
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
                id="seed"
                label="Seed"
                hint="integer"
                value={config.params.seed}
                onChange={(v) => updateParams({ seed: v })}
                step={1}
                placeholder="Default"
              />
              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="stop">Stop Sequences</Label>
                  <span className="text-xs text-muted-foreground">
                    comma-separated
                  </span>
                </div>
                <Input
                  id="stop"
                  placeholder="e.g. \n, END"
                  value={config.params.stop}
                  onChange={(e) => updateParams({ stop: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
                  <span className="text-xs text-muted-foreground">
                    for o1/o3 models
                  </span>
                </div>
                <Select
                  value={config.params.reasoningEffort ?? ""}
                  onValueChange={(v) =>
                    updateParams({
                      reasoningEffort: v === "" ? null : (v as ReasoningEffort),
                    })
                  }
                >
                  <SelectTrigger id="reasoningEffort" className="w-full">
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
            </fieldset>
          </div>
        </div>
      </aside>
    </>
  );
}
