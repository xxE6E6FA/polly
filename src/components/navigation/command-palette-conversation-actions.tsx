import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { Action } from "./command-palette-types";

type CommandPaletteConversationActionsProps = {
  filteredConversationActions: Action[];
  exportingFormat: "json" | "md" | null;
  targetConversationIsPinned?: boolean;
};

export function CommandPaletteConversationActions({
  filteredConversationActions,
  exportingFormat,
  targetConversationIsPinned,
}: CommandPaletteConversationActionsProps) {
  return (
    <CommandGroup
      heading="Actions"
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
              action.disabled ||
              (isExportAction && exportingFormat === action.id.split("-")[1])
            }
          >
            <IconComponent
              className={`size-4 flex-shrink-0 ${isDeleteAction ? "text-destructive" : "text-muted-foreground"}`}
              weight={
                isPinAction && targetConversationIsPinned ? "fill" : "regular"
              }
            />
            <span
              className={`flex-1 ${isDeleteAction ? "text-destructive" : ""}`}
            >
              {isExportAction && exportingFormat === action.id.split("-")[1]
                ? "Exporting..."
                : action.label}
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
