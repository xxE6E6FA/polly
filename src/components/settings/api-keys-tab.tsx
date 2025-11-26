import { api } from "@convex/_generated/api";
import { ArrowSquareOutIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserSettings } from "@/hooks/use-user-settings";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { isUserSettings } from "@/lib/type-guards";
import { validateApiKey } from "@/lib/validation";
import { useToast } from "@/providers/toast-context";
import { SettingsHeader } from "./settings-header";
import { SettingsPageLayout } from "./ui/settings-page-layout";

type ApiKeyInfo = {
  provider: string;
  isValid: boolean;
  hasKey: boolean;
  partialKey: string;
  createdAt: number;
  encryptionType: string;
};

type ApiProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "openrouter"
  | "replicate"
  | "elevenlabs";

const API_KEY_INFO = {
  openai: {
    name: "OpenAI",
    url: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
  },
  anthropic: {
    name: "Anthropic",
    url: "https://console.anthropic.com/settings/keys",
    placeholder: "sk-ant-...",
  },
  google: {
    name: "Google",
    url: "https://makersuite.google.com/app/apikey",
    placeholder: "AI...",
  },
  groq: {
    name: "Groq",
    url: "https://console.groq.com/keys",
    placeholder: "gsk_...",
  },
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/keys",
    placeholder: "sk-or-...",
  },
  replicate: {
    name: "Replicate",
    url: "https://replicate.com/account/api-tokens",
    placeholder: "r8_...",
  },
  elevenlabs: {
    name: "ElevenLabs",
    url: "https://elevenlabs.io/app/settings/api-keys",
    placeholder: "sk-...",
  },
};

// Helper to detect stored key
const hasStoredKey = (k: unknown): boolean => {
  if (k && typeof k === "object") {
    const obj = k as {
      hasKey?: boolean;
      encryptedKey?: unknown;
      clientEncryptedKey?: unknown;
    };
    if (typeof obj.hasKey === "boolean") {
      return obj.hasKey;
    }
    return Boolean(obj.encryptedKey || obj.clientEncryptedKey);
  }
  return false;
};

export const ApiKeysTab = () => {
  const userSettingsRaw = useUserSettings();
  const apiKeysRaw = useQuery(api.apiKeys.getUserApiKeys);
  const storeKeyMutation = useMutation(api.apiKeys.storeApiKey);
  const removeKeyMutation = useMutation(api.apiKeys.removeApiKey);

  const updateUserSettingsMutation = useMutation(
    api.userSettings.updateUserSettings
  );
  const managedToast = useToast();

  // Apply type guard to ensure proper typing
  const userSettings = isUserSettings(userSettingsRaw) ? userSettingsRaw : null;

  const isLoading = apiKeysRaw === undefined;

  const apiKeys = useMemo(() => {
    if (apiKeysRaw) {
      return apiKeysRaw;
    }
    return get(CACHE_KEYS.apiKeys, []);
  }, [apiKeysRaw]);

  const hasOpenRouterKey = apiKeys?.some(
    (key: ApiKeyInfo) => key.provider === "openrouter" && hasStoredKey(key)
  );

  const handleOpenRouterSortingChange = (value: string) => {
    updateUserSettingsMutation({
      openRouterSorting: value as
        | "default"
        | "price"
        | "throughput"
        | "latency",
    });

    managedToast.success("OpenRouter Settings Updated", {
      description: "Your provider sorting preference has been saved.",
    });
  };

  const handleApiKeySubmit = async (
    provider: ApiProvider,
    formData: FormData
  ) => {
    const key = formData.get(`${provider}-key`) as string;

    if (!key?.trim()) {
      return;
    }

    if (!validateApiKey(provider, key.trim())) {
      managedToast.error("Invalid API Key", {
        description: `Please enter a valid ${API_KEY_INFO[provider].name} API key.`,
      });
      return;
    }

    try {
      await storeKeyMutation({ provider, rawKey: key.trim() });
      managedToast.success("API Key Saved", {
        description: `Your ${API_KEY_INFO[provider].name} API key has been securely stored.`,
      });
    } catch (error) {
      managedToast.error("Error", {
        description:
          error instanceof Error
            ? error.message
            : "Failed to save API key. Please try again.",
      });
    }
  };

  const handleApiKeyRemove = async (provider: ApiProvider) => {
    try {
      await removeKeyMutation({ provider });
      managedToast.success("API Key Removed", {
        description: `Your ${API_KEY_INFO[provider].name} API key has been removed.`,
      });
    } catch {
      managedToast.error("Error", {
        description: "Failed to remove API key. Please try again.",
      });
    }
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="API Keys"
        description="Configure your API keys to use different AI providers. Keys are securely encrypted and stored."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(
          Object.entries(API_KEY_INFO) as [
            ApiProvider,
            (typeof API_KEY_INFO)[ApiProvider],
          ][]
        ).map(([provider, info]) => {
          const keyInfo = apiKeys.find(
            (k: ApiKeyInfo) => k.provider === provider
          );
          const isConnected = hasStoredKey(keyInfo);

          if (isLoading) {
            return (
              <div
                key={provider}
                className="flex h-full flex-col justify-between rounded-lg bg-muted/20 p-4 shadow-sm ring-1 ring-border/30"
              >
                <div className="mb-4 flex items-start gap-3">
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-9 w-full" />
              </div>
            );
          }

          return (
            <div
              key={provider}
              className="flex h-full flex-col justify-between rounded-lg bg-muted/20 p-4 shadow-sm ring-1 ring-border/30"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <ProviderIcon
                    provider={provider}
                    className="h-8 w-8 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={provider}
                        className="text-base font-medium"
                      >
                        {info.name}
                      </Label>
                      {isConnected && (
                        <Badge variant="secondary" size="sm">
                          <CheckCircleIcon className="mr-1 h-3 w-3" /> Connected
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {!isConnected && (
                  <Button
                    as="a"
                    size="sm"
                    variant="ghost"
                    href={info.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get key <ArrowSquareOutIcon className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>

              <div className="mt-auto">
                {isConnected && (
                  <div className="flex gap-2">
                    <Input
                      disabled
                      id={provider}
                      type="text"
                      className="h-9 flex-1 font-mono text-sm"
                      placeholder={keyInfo?.partialKey || info.placeholder}
                    />
                    <Button
                      variant="destructive"
                      className="h-9"
                      onClick={() =>
                        handleApiKeyRemove(provider as ApiProvider)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )}
                {!isConnected && (
                  <form
                    className="flex gap-2"
                    action={formData =>
                      handleApiKeySubmit(provider as ApiProvider, formData)
                    }
                  >
                    <Input
                      required
                      id={provider}
                      name={`${provider}-key`}
                      type="password"
                      placeholder={info.placeholder}
                      className="h-9 flex-1 font-mono text-sm"
                    />
                    <Button type="submit" className="h-9">
                      Save
                    </Button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasOpenRouterKey && (
        <div className="rounded-lg bg-muted/20 p-4 shadow-sm ring-1 ring-border/30">
          <div className="flex items-start justify-between gap-4">
            <div className="stack-sm flex-1">
              <div className="flex items-center gap-3">
                <ProviderIcon
                  provider="openrouter"
                  className="h-6 w-6 shrink-0"
                />
                <h3 className="text-base font-semibold">
                  OpenRouter Provider Sorting
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Choose how OpenRouter routes your requests across providers.{" "}
                <a
                  href="https://openrouter.ai/docs/features/provider-routing#provider-sorting"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Learn more
                </a>
              </p>
            </div>
            <Select
              value={userSettings?.openRouterSorting || "default"}
              onValueChange={handleOpenRouterSortingChange}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="price">Lowest Price</SelectItem>
                <SelectItem value="throughput">Highest Throughput</SelectItem>
                <SelectItem value="latency">Lowest Latency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </SettingsPageLayout>
  );
};
