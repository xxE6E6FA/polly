import {
  ArchiveIcon,
  ChatCircleIcon,
  PushPinIcon,
} from "@phosphor-icons/react";
import { ProviderIcon } from "@/components/models/provider-icons";
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { getModelCapabilities } from "@/lib/model-capabilities";
import type { ModelForCapabilities } from "@/types";
import type {
  Action,
  ConversationType,
  DisplayModel,
} from "./command-palette-types";

type CommandPaletteMainMenuProps = {
  isConversationPage: boolean;
  hasCurrentConversation: boolean;
  isPinned?: boolean;
  filteredConversationActions: Action[];
  filteredGlobalActions: Action[];
  filteredSettingsActions: Action[];
  conversationsToShow: ConversationType[];
  modelsToShow: DisplayModel[];
  modelsLoaded: boolean;
  hasSearchQuery: boolean;
  exportingFormat: "json" | "md" | null;
  currentSelectedModel: { modelId: string; provider: string } | null;
  online: boolean;
  onNavigateToConversation: (conversationId: string) => void;
  onConversationActions: (conversationId: string, title: string) => void;
  onSelectModel: (modelId: string, provider: string) => void;
};

export function CommandPaletteMainMenu({
  isConversationPage,
  hasCurrentConversation,
  isPinned,
  filteredConversationActions,
  filteredGlobalActions,
  filteredSettingsActions,
  conversationsToShow,
  modelsToShow,
  modelsLoaded,
  hasSearchQuery,
  exportingFormat,
  currentSelectedModel,
  online,
  onNavigateToConversation,
  onConversationActions,
  onSelectModel,
}: CommandPaletteMainMenuProps) {
  return (
    <>
      {/* Conversation-specific actions - Show first when on conversation page */}
      {isConversationPage &&
        hasCurrentConversation &&
        filteredConversationActions.length > 0 && (
          <CommandGroup
            heading="Conversation"
            className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
          >
            {filteredConversationActions.map(action => {
              const IconComponent = action.icon;
              const isExportAction = action.id.startsWith("export-");
              const isDeleteAction = action.id === "delete-conversation";
              const isPinAction = action.id === "toggle-pin";

              return (
                <CommandItem
                  key={action.id}
                  value={action.id}
                  onSelect={action.handler}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                  disabled={
                    isExportAction &&
                    exportingFormat === action.id.split("-")[1]
                  }
                >
                  <IconComponent
                    className={`size-4 flex-shrink-0 ${isDeleteAction ? "text-destructive" : "text-muted-foreground"}`}
                    weight={isPinAction && isPinned ? "fill" : "regular"}
                  />
                  <span
                    className={`flex-1 ${isDeleteAction ? "text-destructive" : ""}`}
                  >
                    {isExportAction &&
                    exportingFormat === action.id.split("-")[1]
                      ? "Exporting..."
                      : action.label}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

      {/* Global actions - Show after conversation actions */}
      {filteredGlobalActions.length > 0 && (
        <>
          {isConversationPage &&
            hasCurrentConversation &&
            filteredConversationActions.length > 0 && (
              <CommandSeparator className="my-2" />
            )}
          <CommandGroup
            heading="Actions"
            className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
          >
            {filteredGlobalActions.map(action => {
              const IconComponent = action.icon;

              return (
                <CommandItem
                  key={action.id}
                  value={action.id}
                  onSelect={action.handler}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                  disabled={action.disabled}
                >
                  <IconComponent className="size-4 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1">{action.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </>
      )}

      {filteredSettingsActions.length > 0 && (
        <>
          {(filteredGlobalActions.length > 0 ||
            (isConversationPage &&
              hasCurrentConversation &&
              filteredConversationActions.length > 0)) && (
            <CommandSeparator className="my-2" />
          )}
          <CommandGroup
            heading="Settings"
            className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
          >
            {filteredSettingsActions.map(action => {
              const IconComponent = action.icon;

              return (
                <CommandItem
                  key={action.id}
                  value={action.id}
                  onSelect={action.handler}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                  disabled={action.disabled}
                >
                  <IconComponent className="size-4 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1">{action.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </>
      )}

      {conversationsToShow && conversationsToShow.length > 0 && (
        <>
          {(filteredGlobalActions.length > 0 ||
            filteredSettingsActions.length > 0 ||
            (isConversationPage &&
              hasCurrentConversation &&
              filteredConversationActions.length > 0)) && (
            <CommandSeparator className="my-2" />
          )}
          <CommandGroup
            heading={hasSearchQuery ? "Conversations" : "Recent Conversations"}
            className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
          >
            {conversationsToShow.map((conversation: ConversationType) => (
              <CommandItem
                key={conversation._id}
                value={`conversation-${conversation._id}`}
                onSelect={() => onNavigateToConversation(conversation._id)}
                onPointerDown={event => {
                  if (event.metaKey || event.ctrlKey) {
                    event.preventDefault();
                    onConversationActions(conversation._id, conversation.title);
                  }
                }}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                disabled={!online}
              >
                <ChatCircleIcon className="size-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">
                    {conversation.title}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {conversation.isPinned && (
                    <PushPinIcon
                      className="size-3 text-muted-foreground flex-shrink-0"
                      weight="fill"
                    />
                  )}
                  {conversation.isArchived && (
                    <ArchiveIcon className="size-3 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      )}

      {modelsLoaded && modelsToShow && modelsToShow.length > 0 && (
        <>
          {(filteredGlobalActions.length > 0 ||
            filteredSettingsActions.length > 0 ||
            (isConversationPage &&
              hasCurrentConversation &&
              filteredConversationActions.length > 0) ||
            conversationsToShow?.length > 0) && (
            <CommandSeparator className="my-2" />
          )}
          <CommandGroup
            heading={hasSearchQuery ? "Models" : "Switch Model"}
            className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
          >
            {modelsToShow.map(model => {
              const isSelected =
                currentSelectedModel?.modelId === model.modelId &&
                currentSelectedModel?.provider === model.provider;

              const capabilities = getModelCapabilities(
                model as ModelForCapabilities
              );

              return (
                <CommandItem
                  key={`${model.provider}-${model.modelId}`}
                  value={`model-${model.provider}-${model.modelId}`}
                  onSelect={() => onSelectModel(model.modelId, model.provider)}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                >
                  <ProviderIcon
                    provider={model.free ? "polly" : model.provider}
                    className="h-4 w-4 text-muted-foreground flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{model.name}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {capabilities.length > 0 &&
                      capabilities.map((capability, index) => {
                        const IconComponent = capability.icon;
                        return (
                          <div
                            key={`${model.modelId}-${capability.label}-${index}`}
                            className="flex h-4 w-4 items-center justify-center rounded-sm bg-muted/50"
                            title={capability.label}
                          >
                            <IconComponent className="size-2.5 text-muted-foreground" />
                          </div>
                        );
                      })}
                    {isSelected && (
                      <div className="h-2 w-2 rounded-full bg-success flex-shrink-0 ml-1" />
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </>
      )}
    </>
  );
}
