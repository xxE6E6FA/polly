import { api } from "@convex/_generated/api";

type ApiKeyInfo = {
  provider: string;
  isValid: boolean;
  hasKey: boolean;
  partialKey: string;
  createdAt: number;
  encryptionType: string;
};

import { ArrowSquareOutIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { ProviderIcon } from "@/components/provider-icons";
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
import { useUserSettings } from "@/hooks/use-user-settings";
import { CACHE_KEYS, get } from "@/lib/local-storage";
import { isUserSettings } from "@/lib/type-guards";
import { validateApiKey } from "@/lib/validation";
import { useToast } from "@/providers/toast-context";
import { Badge } from "../ui/badge";
import { SettingsHeader } from "./settings-header";

type ApiProvider =
  | "openai"
  | "anthropic"
  | "google"
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

function getProviderCardStyle(isConnected: boolean) {
  const baseStyle = "p-4 rounded-lg border transition-all duration-200";

  if (isConnected) {
    return `${baseStyle} border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:from-blue-500/15 hover:to-purple-500/15 dark:from-blue-500/15 dark:to-purple-500/15 dark:hover:from-blue-500/20 dark:hover:to-purple-500/20`;
  }

  return `${baseStyle} border-border bg-background hover:bg-muted/50`;
}

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

  if (apiKeys === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <SettingsHeader
          title="API Keys"
          description="Configure your API keys to use different AI providers. Keys are securely encrypted and stored."
        />

        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          {(
            Object.entries(API_KEY_INFO) as Array<
              [ApiProvider, (typeof API_KEY_INFO)[ApiProvider]]
            >
          ).map(([provider]) => (
            <div
              key={provider}
              className="animate-pulse rounded-lg border border-muted/40 bg-background p-4"
            >
              <div className="mb-4 h-20 rounded bg-muted/20" />
              <div className="h-10 rounded bg-muted/20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader
        title="API Keys"
        description="Configure your API keys to use different AI providers. Keys are securely encrypted and stored across all your devices."
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        {(
          Object.entries(API_KEY_INFO) as Array<
            [ApiProvider, (typeof API_KEY_INFO)[ApiProvider]]
          >
        ).map(([provider, info]) => {
          const keyInfo = apiKeys.find(
            (k: ApiKeyInfo) => k.provider === provider
          );
          const isConnected = hasStoredKey(keyInfo);

          return (
            <div
              key={provider}
              className={`${getProviderCardStyle(isConnected)} flex h-full flex-col justify-between`}
            >
              <div className="mb-4 flex flex-shrink-0 items-start justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <ProviderIcon
                    provider={provider}
                    className="h-8 w-8 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={provider}
                        className="text-base font-medium"
                      >
                        {info.name}
                      </Label>
                      {isConnected && (
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
                        >
                          <CheckCircleIcon className="mr-1 h-3 w-3" /> Connected
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {!isConnected && (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="ml-3 h-8 shrink-0 px-3 text-xs"
                  >
                    <a
                      href={info.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                    >
                      Get API key <ArrowSquareOutIcon className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>

              <div className="mt-auto">
                {isConnected ? (
                  <div className="flex flex-shrink-0 gap-2">
                    <Input
                      disabled
                      id={provider}
                      type="text"
                      className="flex-1 h-9 border-blue-500/20 bg-blue-500/5 font-mono text-sm dark:bg-blue-500/10"
                      placeholder={`Current: ${keyInfo?.partialKey || info.placeholder.replace(/\./g, "•")}`}
                    />
                    <Button
                      variant="destructive"
                      className="px-4 h-9"
                      onClick={() =>
                        handleApiKeyRemove(provider as ApiProvider)
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <form
                    className="flex flex-shrink-0 gap-2"
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
                      className="flex-1 h-9 font-mono text-sm"
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
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-3">
            <ProviderIcon provider="openrouter" className="h-6 w-6 shrink-0" />
            <h3 className="text-sm font-medium">OpenRouter Provider Sorting</h3>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose how OpenRouter routes your requests across providers.{" "}
              <a
                href="https://openrouter.ai/docs/features/provider-routing#provider-sorting"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
              >
                View documentation <ArrowSquareOutIcon className="h-3 w-3" />
              </a>
            </p>

            <div className="space-y-2">
              <Label htmlFor="openrouter-sorting" className="text-sm">
                Sorting Strategy
              </Label>
              <Select
                value={userSettings?.openRouterSorting || "default"}
                onValueChange={handleOpenRouterSortingChange}
              >
                <SelectTrigger id="openrouter-sorting" className="w-full">
                  <SelectValue placeholder="Select a sorting strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    Default Load Balancing
                  </SelectItem>
                  <SelectItem value="price">Lowest Price</SelectItem>
                  <SelectItem value="throughput">Highest Throughput</SelectItem>
                  <SelectItem value="latency">Lowest Latency</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
