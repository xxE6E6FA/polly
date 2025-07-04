import { ArrowSquareOutIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

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
import { useUser } from "@/hooks/use-user";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useOptimisticUserSettingsUpdate } from "@/hooks/use-optimistic-toggles";
import { validateApiKey } from "@/lib/validation";

import { SettingsHeader } from "./settings-header";
import { api } from "../../../convex/_generated/api";
import { Badge } from "../ui/badge";

type ApiProvider = "openai" | "anthropic" | "google" | "openrouter";

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
};

function getProviderCardStyle(isConnected: boolean) {
  const baseStyle = "p-4 rounded-lg border transition-all duration-200";

  if (isConnected) {
    return `${baseStyle} border-blue-500/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10 hover:from-blue-500/15 hover:to-purple-500/15 dark:from-blue-500/15 dark:to-purple-500/15 dark:hover:from-blue-500/20 dark:hover:to-purple-500/20`;
  }

  return `${baseStyle} border-border bg-background hover:bg-muted/50`;
}

export const ApiKeysTab = () => {
  const { user } = useUser();
  const userSettings = useUserSettings(user?._id);
  const apiKeys = useQuery(api.apiKeys.getUserApiKeys);
  const storeKeyMutation = useMutation(api.apiKeys.storeApiKey);
  const removeKeyMutation = useMutation(api.apiKeys.removeApiKey);

  // Use optimistic updates for immediate feedback
  const { mutate: updateUserSettingsOptimistic } =
    useOptimisticUserSettingsUpdate();

  // Check if user has OpenRouter API key
  const hasOpenRouterKey = apiKeys?.some(
    key => key.provider === "openrouter" && key.hasKey
  );

  const handleOpenRouterSortingChange = (value: string) => {
    // Use optimistic mutation for immediate feedback
    updateUserSettingsOptimistic({
      openRouterSorting: value as
        | "default"
        | "price"
        | "throughput"
        | "latency",
    });

    toast.success("OpenRouter Settings Updated", {
      description: "Your provider sorting preference has been saved.",
    });
  };

  const handleApiKeySubmit = async (
    provider: ApiProvider,
    formData: FormData
  ) => {
    const key = formData.get(`${provider}-key`) as string;

    if (key?.trim()) {
      // Validate on client side first
      if (!validateApiKey(provider, key.trim())) {
        toast.error("Invalid API Key", {
          description: `Please enter a valid ${API_KEY_INFO[provider].name} API key.`,
        });
        return;
      }

      try {
        await storeKeyMutation({
          provider,
          rawKey: key.trim(),
        });

        toast.success("API Key Saved", {
          description: `Your ${API_KEY_INFO[provider].name} API key has been securely stored.`,
        });
      } catch (error) {
        toast.error("Error", {
          description:
            error instanceof Error
              ? error.message
              : "Failed to save API key. Please try again.",
        });
      }
    }
  };

  const handleApiKeyRemove = async (provider: ApiProvider) => {
    try {
      await removeKeyMutation({ provider });

      toast.success("API Key Removed", {
        description: `Your ${API_KEY_INFO[provider].name} API key has been removed.`,
      });
    } catch {
      toast.error("Error", {
        description: "Failed to remove API key. Please try again.",
      });
    }
  };

  // Show loading state
  if (apiKeys === undefined) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <SettingsHeader
          description="Configure your API keys to use different AI providers. Keys are securely encrypted and stored."
          title="API Keys"
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
    <div className="max-w-4xl mx-auto space-y-6">
      <SettingsHeader
        description="Configure your API keys to use different AI providers. Keys are securely encrypted and stored across all your devices."
        title="API Keys"
      />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        {(
          Object.entries(API_KEY_INFO) as Array<
            [ApiProvider, (typeof API_KEY_INFO)[ApiProvider]]
          >
        ).map(([provider, info]) => {
          const keyInfo = apiKeys.find(key => key.provider === provider);
          const isConnected = keyInfo?.hasKey || false;

          return (
            <div
              key={provider}
              className={`${getProviderCardStyle(isConnected)} flex h-full flex-col justify-between`}
            >
              <div className="mb-4 flex flex-shrink-0 items-start justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 justify-center">
                    <ProviderIcon provider={provider} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Label
                        className="text-base font-medium"
                        htmlFor={provider}
                      >
                        {info.name}
                      </Label>
                      {isConnected && (
                        <Badge
                          className="border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:border-blue-500/30 dark:from-blue-500/20 dark:to-purple-500/20 dark:text-blue-300"
                          size="sm"
                          variant="secondary"
                        >
                          <CheckCircleIcon className="mr-1 h-3 w-3" />
                          Connected
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {!isConnected && (
                  <Button
                    asChild
                    className="ml-3 h-8 shrink-0 px-3 text-xs"
                    size="sm"
                    variant="ghost"
                  >
                    <a
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                      href={info.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Get API key
                      <ArrowSquareOutIcon className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>

              <div className="mt-auto">
                {isConnected ? (
                  <div className="flex flex-shrink-0 gap-2">
                    <div className="flex-1">
                      <Input
                        disabled
                        className="border-blue-500/20 bg-blue-500/5 font-mono text-sm dark:bg-blue-500/10"
                        id={provider}
                        placeholder={`Current: ${keyInfo?.partialKey || info.placeholder.replace(/\./g, "•")}`}
                        type="text"
                      />
                    </div>
                    <Button
                      className="px-4"
                      size="sm"
                      variant="destructive"
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
                    <div className="flex-1">
                      <Input
                        required
                        className="font-mono text-sm"
                        id={provider}
                        name={`${provider}-key`}
                        placeholder={info.placeholder}
                        type="password"
                      />
                    </div>
                    <Button size="sm" type="submit" variant="default">
                      Save
                    </Button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* OpenRouter Provider Settings */}
      {hasOpenRouterKey && (
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-6 w-6 shrink-0 justify-center">
              <ProviderIcon provider="openrouter" />
            </div>
            <h3 className="text-sm font-medium">OpenRouter Provider Sorting</h3>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose how OpenRouter routes your requests across providers.{" "}
              <a
                className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                href="https://openrouter.ai/docs/features/provider-routing#provider-sorting"
                rel="noopener noreferrer"
                target="_blank"
              >
                View documentation
                <ArrowSquareOutIcon className="h-3 w-3" />
              </a>
            </p>

            <div className="space-y-2">
              <Label className="text-sm" htmlFor="openrouter-sorting">
                Sorting Strategy
              </Label>
              <Select
                value={userSettings?.openRouterSorting || "default"}
                onValueChange={handleOpenRouterSortingChange}
              >
                <SelectTrigger className="w-full" id="openrouter-sorting">
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
