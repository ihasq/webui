import { useState, useEffect, useMemo, useCallback } from "react";

export interface ModelInfo {
  id: string;
  name: string;
  developer: string;
  cost?: { input: number; output: number };
  limit?: { context: number; output: number };
}

export interface ProviderInfo {
  id: string;
  name: string;
  api?: string;
  env?: string[];
  models: ModelInfo[];
}

/** Known OpenAI-compatible endpoints for providers that lack an `api` field */
const KNOWN_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
};

const CACHE_KEY = "webui-models-cache";
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const CACHE_VERSION = 2; // bump when schema changes

interface CacheEntry {
  data: ProviderInfo[];
  ts: number;
  v?: number;
}

function loadCache(): ProviderInfo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if ((entry.v ?? 0) < CACHE_VERSION) return null;
    if (Date.now() - entry.ts > CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function saveCache(data: ProviderInfo[]) {
  try {
    const entry: CacheEntry = { data, ts: Date.now(), v: CACHE_VERSION };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}

function parseApiData(raw: Record<string, unknown>): ProviderInfo[] {
  const providers: ProviderInfo[] = [];

  for (const [providerId, providerRaw] of Object.entries(raw)) {
    const p = providerRaw as Record<string, unknown>;
    const api = (p.api as string) || KNOWN_ENDPOINTS[providerId];
    if (!api) continue; // skip providers without an OpenAI-compatible endpoint

    const modelsRaw = (p.models ?? {}) as Record<string, Record<string, unknown>>;
    const providerName = (p.name as string) ?? providerId;
    const models: ModelInfo[] = Object.entries(modelsRaw).map(
      ([modelId, m]) => {
        const slashIdx = modelId.indexOf("/");
        const developer =
          slashIdx > 0 ? modelId.slice(0, slashIdx) : providerName;
        return {
          id: modelId,
          name: (m.name as string) ?? modelId,
          developer,
          cost: m.cost as ModelInfo["cost"],
          limit: m.limit as ModelInfo["limit"],
        };
      }
    );

    if (models.length === 0) continue;

    providers.push({
      id: providerId,
      name: providerName,
      api,
      env: p.env as string[],
      models,
    });
  }

  providers.sort((a, b) => a.name.localeCompare(b.name));
  return providers;
}

export function useModelsRegistry() {
  const [providers, setProviders] = useState<ProviderInfo[]>(
    () => loadCache() ?? []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = loadCache();
    if (cached && cached.length > 0) {
      setProviders(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch("https://models.dev/api.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const parsed = parseApiData(data);
        setProviders(parsed);
        saveCache(parsed);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    setLoading(true);
    setError(null);

    fetch("https://models.dev/api.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const parsed = parseApiData(data);
        setProviders(parsed);
        saveCache(parsed);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const providerMap = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers]
  );

  return { providers, providerMap, loading, error, refresh };
}
