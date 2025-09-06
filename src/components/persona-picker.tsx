import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CheckIcon, UserIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { memo, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover-with-backdrop";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUserDataContext } from "@/providers/user-data-context";

type PersonaPickerProps = {
  compact?: boolean;
  className?: string;
  selectedPersonaId?: Id<"personas"> | null;
  onPersonaSelect?: (personaId: Id<"personas"> | null) => void;
  tooltip?: string | React.ReactNode;
};

function PersonaPickerComponent({
  compact = false,
  className,
  selectedPersonaId = null,
  onPersonaSelect,
  tooltip,
}: PersonaPickerProps) {
  const { user } = useUserDataContext();

  const personasRaw = useQuery(api.personas.list, user?._id ? {} : "skip");

  const userPersonaSettingsRaw = useQuery(
    api.userSettings.getUserSettings,
    user?._id ? {} : "skip"
  );

  // Control popover state to ensure proper focus restoration on close
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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

  const handlePersonaSelect = (personaId: Id<"personas"> | null) => {
    onPersonaSelect?.(personaId);
    // Close the popover; Radix will restore focus to the trigger
    setOpen(false);
  };

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
          <span className="text-xs sm:text-sm">{currentPersona.icon}</span>
        ) : (
          <UserIcon className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[120px] truncate font-medium">
          {currentPersona?.name || "Persona"}
        </span>
      </div>
    ),
    [currentPersona?.icon, currentPersona?.name]
  );

  if (!user) {
    return null;
  }
  if (compact) {
    const tooltipText = tooltip || "Select persona";
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  // Unified pill sizing
                  "h-8 w-auto gap-2 px-2.5 text-xs font-medium",
                  "rounded-full border border-border/50",
                  // Subtle pill effect to match ecosystem
                  "bg-muted/20 text-foreground/85 hover:bg-muted/40",
                  // Focus ring parity
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "transition-all duration-200",
                  className
                )}
              >
                {compactTriggerInner}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">{tooltipText}</div>
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          forceMount
          data-debug-id="PersonaPicker"
          avoidCollisions
          className="w-[min(calc(100vw-2rem),380px)] overflow-hidden border-border/50 p-0 shadow-sm"
          side="top"
          sideOffset={4}
        >
          <PersonaList
            personas={availablePersonas}
            currentPersona={currentPersona}
            onPersonaSelect={id => {
              handlePersonaSelect(id);
            }}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Regular (non-compact) view
  return (
    <div className={cn("stack-md", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">AI Personas</h3>
        <Badge variant="secondary" className="text-xs">
          {availablePersonas.length} available
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {/* Default option */}
        <button
          type="button"
          onClick={() => handlePersonaSelect(null)}
          className={cn(
            "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
            !selectedPersonaId && "border-primary bg-primary/5"
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm">
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Default</div>
            <div className="text-xs text-muted-foreground">
              Standard AI assistant
            </div>
          </div>
          {!selectedPersonaId && <CheckIcon className="h-4 w-4 text-primary" />}
        </button>

        {/* Available personas */}
        {availablePersonas.map(persona => (
          <button
            key={persona._id}
            type="button"
            onClick={() => handlePersonaSelect(persona._id)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
              selectedPersonaId === persona._id && "border-primary bg-primary/5"
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm">
              {persona.icon || "🤖"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{persona.name}</div>
              <div className="text-xs text-muted-foreground">
                {persona.description}
              </div>
            </div>
            {selectedPersonaId === persona._id && (
              <CheckIcon className="h-4 w-4 text-primary" />
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
  onPersonaSelect: (personaId: Id<"personas"> | null) => void;
};

const PersonaList = ({
  personas,
  currentPersona,
  onPersonaSelect,
}: PersonaListProps) => {
  // Separate built-in and user-defined personas
  const builtInPersonas = personas.filter(persona => persona.isBuiltIn);
  const userPersonas = personas.filter(persona => !persona.isBuiltIn);

  return (
    <Command className="pt-2">
      <CommandInput className="h-9" placeholder="Search personas..." />
      <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
        <CommandEmpty>
          <div className="p-4 text-center">
            <p className="mb-1 text-sm text-muted-foreground">
              No personas found
            </p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search terms
            </p>
          </div>
        </CommandEmpty>

        {/* Default option */}
        <CommandGroup>
          <CommandItem
            value="default"
            onSelect={() => onPersonaSelect(null)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-sm">
                🤖
              </div>
              <span>Default</span>
            </div>
            {!currentPersona && <CheckIcon className="h-4 w-4" />}
          </CommandItem>
        </CommandGroup>

        {/* Built-in personas */}
        {builtInPersonas.length > 0 && (
          <CommandGroup heading="Built-in Personas">
            {builtInPersonas.map(persona => (
              <CommandItem
                key={persona._id}
                value={persona.name}
                onSelect={() => onPersonaSelect(persona._id)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{persona.icon || "🤖"}</span>
                  <div>
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                </div>
                {currentPersona?._id === persona._id && (
                  <CheckIcon className="h-4 w-4" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* User-defined personas */}
        {userPersonas.length > 0 && (
          <CommandGroup heading="Custom Personas">
            {userPersonas.map(persona => (
              <CommandItem
                key={persona._id}
                value={persona.name}
                onSelect={() => onPersonaSelect(persona._id)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{persona.icon || "🤖"}</span>
                  <div>
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                </div>
                {currentPersona?._id === persona._id && (
                  <CheckIcon className="h-4 w-4" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
};
