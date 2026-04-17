import { ApiError } from "@/lib/api";

type ProviderKey = {
  id: string;
  value: string;
  label: string;
};

export type ProviderStatusView = {
  id: string;
  name: string;
  displayName: string;
  available: boolean;
  readOnly: boolean;
  baseUrl: string | null;
  modalities: GatewayModelView["modality"][];
  models: string[];
  keys: Array<{
    id: string;
    label: string;
  }>;
};

export type GatewayModelView = {
  id: string;
  modality: "llm" | "image" | "video" | "audio";
  capability: "chat" | "generate";
  async: boolean;
  providers: string[];
};

type ProviderRecord = {
  name: string;
  displayName: string;
  baseUrl: string | null;
  keys: ProviderKey[];
  available: boolean;
  readOnly: boolean;
};

export type ProviderRuntimeConfig = {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string | null;
  keys: Array<{
    id: string;
    value: string;
    label: string;
  }>;
  available: boolean;
  readOnly: boolean;
};

type RegistryState = {
  providers: Map<string, ProviderRecord>;
};

const REGISTRY_GLOBAL_KEY = "__gateway_provider_registry__";

const MODEL_CATALOG: GatewayModelView[] = [
  {
    id: "mock-llm",
    modality: "llm",
    capability: "chat",
    async: false,
    providers: ["mock"],
  },
  {
    id: "seedance-2.0",
    modality: "video",
    capability: "generate",
    async: true,
    providers: ["seedance2.0"],
  },
  {
    id: "doubao-seedream-4-5-251128",
    modality: "image",
    capability: "generate",
    async: false,
    providers: ["volcengine"],
  },
];

const DEFAULT_PROVIDER_RECORDS: ProviderRecord[] = [
  {
    name: "seedance2.0",
    displayName: "Seedance 2.0",
    baseUrl: null,
    keys: [],
    available: false,
    readOnly: false,
  },
];

function maskKeyLabel(value: string) {
  const trimmed = value.trim();

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }

  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function slugifyProviderName(providerName: string) {
  const normalized = providerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "provider";
}

function createProviderKey(providerName: string, index: number, value: string): ProviderKey {
  const trimmed = value.trim();

  return {
    id: `${slugifyProviderName(providerName)}-key-${index + 1}`,
    value: trimmed,
    label: maskKeyLabel(trimmed),
  };
}

function createDefaultState(): RegistryState {
  return {
    providers: new Map(DEFAULT_PROVIDER_RECORDS.map((provider) => [provider.name, provider])),
  };
}

function getState(): RegistryState {
  const globalRef = globalThis as typeof globalThis & {
    [REGISTRY_GLOBAL_KEY]?: RegistryState;
  };

  if (!globalRef[REGISTRY_GLOBAL_KEY]) {
    globalRef[REGISTRY_GLOBAL_KEY] = createDefaultState();
  }

  return globalRef[REGISTRY_GLOBAL_KEY]!;
}

export function listGatewayModels(): GatewayModelView[] {
  return MODEL_CATALOG.map((model) => ({
    ...model,
    providers: [...model.providers],
  }));
}

export function assertModelEnabled(input: {
  modelId: string;
  provider: string;
  modality?: GatewayModelView["modality"];
}) {
  const targetModelId = input.modelId.trim();
  const model = MODEL_CATALOG.find((item) => item.id === targetModelId);

  if (!model) {
    throw new ApiError(409, "MODEL_NOT_ENABLED", `Model ${targetModelId} is not registered.`);
  }

  if (input.modality && model.modality !== input.modality) {
    throw new ApiError(409, "MODEL_NOT_ENABLED", `Model ${targetModelId} does not support ${input.modality}.`);
  }

  if (!model.providers.includes(input.provider)) {
    throw new ApiError(409, "MODEL_NOT_ENABLED", `Model ${targetModelId} is not enabled for provider ${input.provider}.`);
  }

  return model;
}

export function listProviderStatuses(): ProviderStatusView[] {
  const state = getState();

  return [...state.providers.values()]
    .map((provider) => {
      const supportedModels = MODEL_CATALOG.filter((model) => model.providers.includes(provider.name));

      return {
        id: provider.name,
        name: provider.name,
        displayName: provider.displayName,
        available: provider.available,
        readOnly: provider.readOnly,
        baseUrl: provider.baseUrl,
        modalities: Array.from(new Set(supportedModels.map((model) => model.modality))),
        models: supportedModels.map((model) => model.id),
        keys: provider.keys.map((key) => ({
          id: key.id,
          label: key.label,
        })),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getProviderRuntimeConfig(provider: string): ProviderRuntimeConfig | null {
  const providerName = provider.trim();
  const state = getState();
  const record = state.providers.get(providerName);

  if (!record) {
    return null;
  }

  return {
    id: record.name,
    name: record.name,
    displayName: record.displayName,
    baseUrl: record.baseUrl,
    available: record.available,
    readOnly: record.readOnly,
    keys: record.keys.map((key) => ({
      id: key.id,
      value: key.value,
      label: key.label,
    })),
  };
}

export function assertProviderAvailable(provider: string) {
  const config = getProviderRuntimeConfig(provider);

  if (!config || !config.available || !config.baseUrl || config.keys.length === 0) {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", `Provider ${provider} is unavailable.`);
  }

  return config;
}

export function updateProviderConfig(input: {
  provider: string;
  baseUrl?: string;
  keys?: string[];
  available?: boolean;
  readOnly?: boolean;
}): ProviderStatusView {
  const providerName = input.provider.trim();
  const state = getState();
  const existing = state.providers.get(providerName);

  if (existing?.readOnly) {
    throw new ApiError(403, "PROVIDER_READ_ONLY", `${providerName} is read-only and cannot be modified.`);
  }

  const nextBaseUrl = input.baseUrl !== undefined ? (input.baseUrl.trim() || null) : (existing?.baseUrl ?? null);
  const nextKeys =
    input.keys !== undefined
      ? input.keys
          .map((key) => key.trim())
          .filter((key) => key.length > 0)
          .map((key, index) => createProviderKey(providerName, index, key))
      : (existing?.keys ?? []);
  const nextReadOnly = input.readOnly ?? existing?.readOnly ?? false;
  const nextAvailable = input.available ?? (nextBaseUrl !== null && nextKeys.length > 0);

  const record: ProviderRecord = {
    name: providerName,
    displayName: existing?.displayName ?? providerName,
    baseUrl: nextBaseUrl,
    keys: nextKeys,
    available: nextAvailable,
    readOnly: nextReadOnly,
  };

  state.providers.set(providerName, record);

  return {
    id: record.name,
    name: record.name,
    displayName: record.displayName,
    available: record.available,
    readOnly: record.readOnly,
    baseUrl: record.baseUrl,
    modalities: Array.from(
      new Set(MODEL_CATALOG.filter((model) => model.providers.includes(record.name)).map((model) => model.modality)),
    ),
    models: MODEL_CATALOG.filter((model) => model.providers.includes(record.name)).map((model) => model.id),
    keys: record.keys.map((key) => ({
      id: key.id,
      label: key.label,
    })),
  };
}

export const __gatewayProviderRegistryTestUtils = {
  reset() {
    const globalRef = globalThis as typeof globalThis & {
      [REGISTRY_GLOBAL_KEY]?: RegistryState;
    };

    delete globalRef[REGISTRY_GLOBAL_KEY];
  },
};
