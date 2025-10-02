import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UserIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  SelectableListItem,
  SelectableListItemIcon,
} from "@/components/ui/selectable-list-item";
import { useUserSettings } from "@/hooks/use-user-settings";
import { isUserSettings } from "@/lib/type-guards";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";

interface PersonaDrawerProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  selectedPersonaId: Id<"personas"> | null;
  onPersonaSelect: (personaId: Id<"personas"> | null) => void;
  disabled?: boolean;
}

export function PersonaDrawer({
  conversationId,
  hasExistingMessages,
  selectedPersonaId,
  onPersonaSelect,
  disabled = false,
}: PersonaDrawerProps) {
  const { user } = useUserDataContext();
  const userSettingsRaw = useUserSettings();
  const { isPrivateMode } = usePrivateMode();

  const personasRaw = useQuery(api.personas.list, user?._id ? {} : "skip");
  const userPersonaSettingsRaw = useQuery(
    api.userSettings.getUserSettings,
    user?._id ? {} : "skip"
  );

  // Use type guards to ensure we have proper arrays
  const personas = Array.isArray(personasRaw) ? personasRaw : [];
  const userPersonaSettings = Array.isArray(userPersonaSettingsRaw)
    ? userPersonaSettingsRaw
    : [];

  // Filter out disabled personas
  const availablePersonas = useMemo(() => {
    return personas.filter(persona => {
      const isDisabled = userPersonaSettings.some(
        setting => setting.personaId === persona._id && setting.isDisabled
      );
      return !isDisabled;
    });
  }, [personas, userPersonaSettings]);

  const currentPersona = selectedPersonaId
    ? availablePersonas.find(p => p._id === selectedPersonaId) || null
    : null;

  // Separate built-in and user-defined personas
  const builtInPersonas = availablePersonas.filter(
    persona => persona.isBuiltIn
  );
  const userPersonas = availablePersonas.filter(persona => !persona.isBuiltIn);

  const handlePersonaSelect = (personaId: Id<"personas"> | null) => {
    onPersonaSelect(personaId);
  };

  const userSettings = isUserSettings(userSettingsRaw) ? userSettingsRaw : null;
  const personasEnabled = userSettings?.personasEnabled !== false;

  // Show persona selector only when starting a new conversation
  const isNewConversation = isPrivateMode && !hasExistingMessages;
  const isNewRegularConversation = !(isPrivateMode || conversationId);
  const shouldShowPersonaSelector =
    isNewConversation || isNewRegularConversation;

  const canShowPersonaSelector = user && personasEnabled;
  const showPersonaSelector =
    canShowPersonaSelector && shouldShowPersonaSelector;

  if (!showPersonaSelector) {
    return null;
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Select persona"
          className="h-9 w-9 rounded-full p-0 sm:hidden bg-accent/60 text-accent-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <UserIcon className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Select Persona</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {/* Persona List */}
          <div className="stack-md">
            {/* Default option */}
            <div className="stack-sm">
              <div className="text-xs font-medium text-muted-foreground px-2">
                Default
              </div>
              <SelectableListItem
                onClick={() => handlePersonaSelect(null)}
                selected={!currentPersona}
                className="p-2"
              >
                <div className="flex items-center gap-2">
                  <SelectableListItemIcon>
                    <span className="text-sm">🤖</span>
                  </SelectableListItemIcon>
                  <div className="text-left">
                    <div className="font-medium text-sm">Default</div>
                    <div className="text-xs text-muted-foreground">
                      Standard AI assistant
                    </div>
                  </div>
                </div>
              </SelectableListItem>
            </div>

            {/* Built-in personas */}
            {builtInPersonas.length > 0 && (
              <div className="stack-md">
                <div className="text-xs font-medium text-muted-foreground px-2">
                  Built-in
                </div>
                {builtInPersonas.map(persona => (
                  <SelectableListItem
                    key={persona._id}
                    onClick={() => handlePersonaSelect(persona._id)}
                    selected={currentPersona?._id === persona._id}
                    className="p-2"
                  >
                    <div className="flex items-center gap-2">
                      <SelectableListItemIcon>
                        <span className="text-sm">{persona.icon || "🤖"}</span>
                      </SelectableListItemIcon>
                      <div className="text-left">
                        <div className="font-medium text-sm">
                          {persona.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {persona.description}
                        </div>
                      </div>
                    </div>
                  </SelectableListItem>
                ))}
              </div>
            )}

            {/* User-defined personas */}
            {userPersonas.length > 0 && (
              <div className="stack-sm">
                <div className="text-xs font-medium text-muted-foreground px-2">
                  Custom
                </div>
                {userPersonas.map(persona => (
                  <SelectableListItem
                    key={persona._id}
                    onClick={() => handlePersonaSelect(persona._id)}
                    selected={currentPersona?._id === persona._id}
                    className="p-2"
                  >
                    <div className="flex items-center gap-2">
                      <SelectableListItemIcon>
                        <span className="text-sm">{persona.icon || "🤖"}</span>
                      </SelectableListItemIcon>
                      <div className="text-left">
                        <div className="font-medium text-sm">
                          {persona.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {persona.description}
                        </div>
                      </div>
                    </div>
                  </SelectableListItem>
                ))}
              </div>
            )}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
