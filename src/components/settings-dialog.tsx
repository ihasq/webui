import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Settings, RefreshCw } from "lucide-react";
import type { ChatConfig, InferenceParams } from "@/hooks/use-chat";
import { useModelsRegistry, type ProviderInfo } from "@/hooks/use-models-registry";
import { ModelSearch } from "@/components/model-search";

interface SettingsDialogProps {
  config: ChatConfig;
  onChange: (config: ChatConfig) => void;
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
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-muted-foreground">{hint}</span>
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
      )}
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

  const currentProvider: ProviderInfo | undefined =
    providerMap.get(selectedProvider);

  const handleProviderChange = (providerId: string | null) => {
    if (!providerId) return;
    setSelectedProvider(providerId);
    const provider = providerMap.get(providerId);
    if (provider?.api) {
      onChange({ ...config, endpoint: provider.api, model: "" });
    }
  };

  const handleModelChange = (modelId: string | null) => {
    if (!modelId) return;
    onChange({ ...config, model: modelId });
  };

  return (
    <fieldset className="grid gap-3">
      <div className="flex items-center justify-between">
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

      <div className="grid gap-1.5">
        <Label>Provider</Label>
        <Select
          value={selectedProvider}
          onValueChange={handleProviderChange}
        >
          <SelectTrigger className="w-full">
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
        <div className="grid gap-1.5">
          <Label>Model</Label>
          <Select
            value={config.model || undefined}
            onValueChange={handleModelChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model..." />
            </SelectTrigger>
            <SelectContent>
              {currentProvider.models.map((m) => (
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
      )}
    </fieldset>
  );
}

export function SettingsDialog({ config, onChange }: SettingsDialogProps) {
  const updateParams = (patch: Partial<InferenceParams>) =>
    onChange({ ...config, params: { ...config.params, ...patch } });

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon" />}>
        <Settings className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 py-4">
          {/* Model Registry */}
          <ProviderModelSelector config={config} onChange={onChange} />

          <hr className="border-border" />

          {/* Connection (manual / override) */}
          <fieldset className="grid gap-3">
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
          <fieldset className="grid gap-3">
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
          <fieldset className="grid gap-3">
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
          </fieldset>
        </div>
      </DialogContent>
    </Dialog>
  );
}
