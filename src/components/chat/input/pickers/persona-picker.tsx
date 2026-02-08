import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CheckCircle, UserIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";
import { DrawerItem } from "../drawer-item";

type PersonaPickerProps = {
  compact?: boolean;
  className?: string;
  selectedPersonaId?: Id<"personas"> | null;
  onPersonaSelect?: (personaId: Id<"personas"> | null) => void;
  tooltip?: string | React.ReactNode;
  disabled?: boolean;
};

function PersonaPickerComponent({
  compact = false,
  className,
  selectedPersonaId = null,
  onPersonaSelect,
  tooltip,
  disabled = false,
}: PersonaPickerProps) {
  const { user } = useUserDataContext();
  const isDesktop = useMediaQuery("(min-width: 640px)");

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

  // Compute current persona before any early returns to satisfy hooks rules
  const currentPersona = useMemo(() => {
    return selectedPersonaId
      ? availablePersonas.find(p => p._id === selectedPersonaId) || null
      : null;
  }, [availablePersonas, selectedPersonaId]);

  const compactTriggerInner = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {currentPersona?.icon ? (
          <span className="text-xs">{currentPersona.icon}</span>
        ) : (
          <UserIcon className="size-3.5" />
        )}
        {isDesktop && (
          <span className="max-w-[120px] truncate font-medium">
            {currentPersona?.name || "Persona"}
          </span>
        )}
      </div>
    ),
    [currentPersona?.icon, currentPersona?.name, isDesktop]
  );

  if (!user) {
    return null;
  }

  if (compact) {
    const tooltipText = tooltip || "Select persona";
    const hasPersona = currentPersona !== null;
    return (
      <ResponsivePicker
        trigger={compactTriggerInner}
        title="Select Persona"
        tooltip={tooltipText}
        disabled={disabled}
        triggerClassName={className}
        pickerVariant={hasPersona ? "active" : "default"}
        ariaLabel="Select persona"
      >
        {isDesktop ? (
          <PersonaListDesktop
            personas={availablePersonas}
            currentPersona={currentPersona}
            onPersonaSelect={onPersonaSelect}
          />
        ) : (
          <PersonaListMobile
            personas={availablePersonas}
            currentPersona={currentPersona}
            onPersonaSelect={onPersonaSelect}
          />
        )}
      </ResponsivePicker>
    );
  }

  // Regular (non-compact) view for settings pages
  return (
    <div className={cn("stack-md", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">AI Personas</h3>
        <Badge variant="secondary" className="text-xs">
          {availablePersonas.length} available
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {/* Default option */}
        <button
          type="button"
          onClick={() => onPersonaSelect?.(null)}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/50",
            !selectedPersonaId && "border-primary bg-primary/5"
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">Default</div>
            <div className="text-xs text-muted-foreground">
              Standard AI assistant
            </div>
          </div>
          {!selectedPersonaId && (
            <CheckCircle
              className="size-5 fill-primary text-primary-foreground"
              weight="fill"
            />
          )}
        </button>

        {/* Available personas */}
        {availablePersonas.map(persona => (
          <button
            key={persona._id}
            type="button"
            onClick={() => onPersonaSelect?.(persona._id)}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/50",
              selectedPersonaId === persona._id && "border-primary bg-primary/5"
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">
              {persona.icon || "🤖"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">{persona.name}</div>
              <div className="text-xs text-muted-foreground">
                {persona.description}
              </div>
            </div>
            {selectedPersonaId === persona._id && (
              <CheckCircle
                className="h-5 w-5 fill-primary text-primary-foreground"
                weight="fill"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export const PersonaPicker = memo(PersonaPickerComponent);

type PersonaListProps = {
  personas: Array<{
    _id: Id<"personas">;
    name: string;
    description: string;
    prompt: string;
    icon?: string;
    isBuiltIn: boolean;
  }>;
  currentPersona: {
    _id: Id<"personas">;
    name: string;
    description: string;
    prompt: string;
    icon?: string;
    isBuiltIn: boolean;
  } | null;
  onPersonaSelect?: (personaId: Id<"personas"> | null) => void;
};

const PersonaListDesktop = ({
  personas,
  currentPersona,
  onPersonaSelect,
}: PersonaListProps) => {
  // Separate built-in and user-defined personas
  const builtInPersonas = personas.filter(persona => persona.isBuiltIn);
  const userPersonas = personas.filter(persona => !persona.isBuiltIn);

  return (
    <Command className="flex h-full min-h-0 w-full flex-1 flex-col [&_[cmdk-input-wrapper]]:sticky [&_[cmdk-input-wrapper]]:top-0 [&_[cmdk-input-wrapper]]:z-10 [&_[cmdk-input-wrapper]]:mx-0 [&_[cmdk-input-wrapper]]:w-full [&_[cmdk-input-wrapper]]:rounded-none [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/40 [&_[cmdk-input-wrapper]]:bg-popover [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-1.5 [&_[cmdk-input-wrapper]]:gap-2 [&_[cmdk-input-wrapper]]:shadow-sm [&_[cmdk-input-wrapper]_svg]:h-3.5 [&_[cmdk-input-wrapper]_svg]:w-3.5 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground [&_[cmdk-input]]:h-8 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:rounded-none [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-xs">
      <CommandInput
        className="h-8 w-full text-xs"
        placeholder="Search personas..."
      />
      <CommandList className="max-h-[min(calc(100dvh-14rem),260px)] overflow-y-auto">
        <CommandEmpty>
          <div className="p-4 text-center">
            <p className="mb-1 text-xs text-muted-foreground">
              No personas found
            </p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search terms
            </p>
          </div>
        </CommandEmpty>

        {/* Default option */}
        <CommandGroup className="p-0">
          <CommandItem
            value="default"
            onSelect={() => onPersonaSelect?.(null)}
            className="flex items-center justify-between gap-2 rounded-none px-3 py-2.5 text-xs"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                🤖
              </div>
              <span>Default</span>
            </div>
            {!currentPersona && (
              <CheckCircle
                className="h-5 w-5 fill-primary text-primary-foreground"
                weight="fill"
              />
            )}
          </CommandItem>
        </CommandGroup>

        {/* Built-in personas */}
        {builtInPersonas.length > 0 && (
          <CommandGroup
            heading="Built-in Personas"
            className="border-t border-border/40 p-0 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
          >
            {builtInPersonas.map(persona => (
              <CommandItem
                key={persona._id}
                value={persona.name}
                onSelect={() => onPersonaSelect?.(persona._id)}
                className="flex items-center justify-between gap-2 rounded-none px-3 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                    {persona.icon || "🤖"}
                  </div>
                  <div className="flex flex-col">
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                </div>
                {currentPersona?._id === persona._id && (
                  <CheckCircle
                    className="h-5 w-5 fill-primary text-primary-foreground"
                    weight="fill"
                  />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* User-defined personas */}
        {userPersonas.length > 0 && (
          <CommandGroup
            heading="Custom Personas"
            className="border-t border-border/40 p-0 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
          >
            {userPersonas.map(persona => (
              <CommandItem
                key={persona._id}
                value={persona.name}
                onSelect={() => onPersonaSelect?.(persona._id)}
                className="flex items-center justify-between gap-2 rounded-none px-3 py-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs">
                    {persona.icon || "🤖"}
                  </div>
                  <div className="flex flex-col">
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                </div>
                {currentPersona?._id === persona._id && (
                  <CheckCircle
                    className="h-5 w-5 fill-primary text-primary-foreground"
                    weight="fill"
                  />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
};

const PersonaListMobile = ({
  personas,
  currentPersona,
  onPersonaSelect,
}: PersonaListProps) => {
  // Separate built-in and user-defined personas
  const builtInPersonas = personas.filter(persona => persona.isBuiltIn);
  const userPersonas = personas.filter(persona => !persona.isBuiltIn);

  return (
    <div className="stack-md">
      {/* Default option */}
      <div className="stack-sm">
        <div className="text-xs font-medium text-muted-foreground px-2">
          Default
        </div>
        <DrawerItem
          icon={<span className="text-sm">🤖</span>}
          name="Default"
          description="Standard AI assistant"
          selected={!currentPersona}
          onClick={() => onPersonaSelect?.(null)}
        />
      </div>

      {/* Built-in personas */}
      {builtInPersonas.length > 0 && (
        <div className="stack-md">
          <div className="text-xs font-medium text-muted-foreground px-2">
            Built-in
          </div>
          {builtInPersonas.map(persona => (
            <DrawerItem
              key={persona._id}
              icon={<span className="text-sm">{persona.icon || "🤖"}</span>}
              name={persona.name}
              description={persona.description}
              selected={currentPersona?._id === persona._id}
              onClick={() => onPersonaSelect?.(persona._id)}
            />
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
            <DrawerItem
              key={persona._id}
              icon={<span className="text-sm">{persona.icon || "🤖"}</span>}
              name={persona.name}
              description={persona.description}
              selected={currentPersona?._id === persona._id}
              onClick={() => onPersonaSelect?.(persona._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
