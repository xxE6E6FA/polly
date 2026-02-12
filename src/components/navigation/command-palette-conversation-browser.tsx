import {
  ArchiveIcon,
  ChatCircleIcon,
  PushPinIcon,
} from "@phosphor-icons/react";
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import type { ConversationType } from "./command-palette-types";

type CommandPaletteConversationBrowserProps = {
  conversationsByCategory: Record<string, ConversationType[]>;
  allConversationsLoaded: boolean;
  online: boolean;
  onNavigateToConversation: (conversationId: string) => void;
  onConversationActions: (conversationId: string, title: string) => void;
};

export function CommandPaletteConversationBrowser({
  conversationsByCategory,
  allConversationsLoaded,
  online,
  onNavigateToConversation,
  onConversationActions,
}: CommandPaletteConversationBrowserProps) {
  return (
    <>
      {Object.entries(conversationsByCategory).map(
        ([category, conversations], categoryIndex) => (
          <div key={category}>
            {categoryIndex > 0 && <CommandSeparator className="my-2" />}
            <CommandGroup
              heading={category}
              className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
            >
              {conversations.map((conversation: ConversationType) => (
                <CommandItem
                  key={conversation._id}
                  value={`conversation-${conversation._id}`}
                  onSelect={() => onNavigateToConversation(conversation._id)}
                  onPointerDown={event => {
                    if (event.metaKey || event.ctrlKey) {
                      event.preventDefault();
                      onConversationActions(
                        conversation._id,
                        conversation.title
                      );
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
                    <div className="text-xs text-muted-foreground">
                      {new Date(
                        conversation._creationTime
                      ).toLocaleDateString()}
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
          </div>
        )
      )}
      {Object.keys(conversationsByCategory).length === 0 &&
        allConversationsLoaded && (
          <div className="flex flex-col items-center gap-2 py-6">
            <ChatCircleIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No conversations found
            </p>
          </div>
        )}
    </>
  );
}
