import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { ProviderIcon } from "@/components/provider-icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import type { AIModel } from "@/types";
import { ModelItem } from "./ModelItem";

// Provider mapping with titles
const PROVIDER_CONFIG = {
  openai: { title: "OpenAI" },
  anthropic: { title: "Anthropic" },
  google: { title: "Google AI" },
  openrouter: { title: "OpenRouter" },
  polly: { title: "Polly" },
} as const;

const ModelListComponent = ({
  userModelsByProvider,
  handleSelect,
  hasReachedPollyLimit,
}: {
  userModelsByProvider: {
    id: string;
    name: string;
    models: AIModel[];
  }[];
  handleSelect: (value: string) => void;
  hasReachedPollyLimit: boolean;
}) => {
  return (
    <Command className="pt-2">
      <CommandInput className="h-9" placeholder="Search models..." />
      <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
        <CommandEmpty>
          <div className="p-4 text-center">
            <MagnifyingGlassIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="mb-1 text-sm text-muted-foreground">
              No models found
            </p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search terms
            </p>
          </div>
        </CommandEmpty>

        {userModelsByProvider?.length === 0 ? (
          <div className="p-6 text-center">
            <p className="mb-2 text-sm text-muted-foreground">
              No models available
            </p>
            <p className="text-xs text-muted-foreground">
              Add API keys and configure models in Settings
            </p>
          </div>
        ) : (
          userModelsByProvider?.map(
            (
              provider: { id: string; name: string; models: AIModel[] },
              providerIndex: number
            ) => {
              const providerConfig =
                PROVIDER_CONFIG[provider.id as keyof typeof PROVIDER_CONFIG];
              const providerTitle = providerConfig?.title || provider.name;

              return (
                <CommandGroup key={provider.id}>
                  <div className="flex items-center gap-2 px-2 py-1.5 opacity-75">
                    <ProviderIcon
                      provider={provider.id}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      {providerTitle}
                    </span>
                  </div>
                  {provider.models.map((model: AIModel) => (
                    <ModelItem
                      key={model.modelId}
                      model={model}
                      onSelect={handleSelect}
                      hasReachedPollyLimit={hasReachedPollyLimit ?? false}
                    />
                  ))}
                  {providerIndex < userModelsByProvider.length - 1 && (
                    <div className="mx-2 my-1.5 h-px bg-border/50" />
                  )}
                </CommandGroup>
              );
            }
          ) || []
        )}
      </CommandList>
    </Command>
  );
};

export const ModelList = memo(ModelListComponent);
