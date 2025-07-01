import { useState } from "react";

import { CaretDownIcon, CheckIcon, UserIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";

import { Backdrop } from "@/components/ui/backdrop";
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
} from "@/components/ui/popover";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useUser } from "@/hooks/use-user";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { cn } from "@/lib/utils";

import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

type PersonaPickerProps = {
  compact?: boolean;
  className?: string;
  selectedPersonaId?: Id<"personas"> | null;
  onPersonaSelect?: (personaId: Id<"personas"> | null) => void;
  tooltip?: string | React.ReactNode;
};

export const PersonaPicker = ({
  compact = false,
  className,
  selectedPersonaId = null,
  onPersonaSelect,
  tooltip,
}: PersonaPickerProps) => {
  const userInfo = useUser();
  const queryUserId = useQueryUserId();
  const personas = useQuery(
    api.personas.list,
    queryUserId ? { userId: queryUserId } : "skip"
  );
  const userPersonaSettings = useQuery(
    api.personas.getUserPersonaSettings,
    queryUserId ? { userId: queryUserId } : "skip"
  );

  const [open, setOpen] = useState(false);

  // Filter out disabled personas
  const availablePersonas = personas?.filter(persona => {
    const isDisabled = userPersonaSettings?.some(
      setting => setting.personaId === persona._id && setting.isDisabled
    );
    return !isDisabled;
  });

  const handlePersonaSelect = (personaId: Id<"personas"> | null) => {
    onPersonaSelect?.(personaId);
    setOpen(false);
  };

  if (!userInfo.user) {
    return null;
  }

  // Find the current persona from the list
  const currentPersona = selectedPersonaId
    ? availablePersonas?.find(p => p._id === selectedPersonaId) || null
    : null;

  if (compact) {
    const TriggerButton = (
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "h-7 w-7 p-0 relative group picker-trigger",
          "hover:bg-accent/50 dark:hover:bg-accent/30",
          "transition-all duration-200",
          open && "bg-accent/50 dark:bg-accent/30",
          className
        )}
      >
        {currentPersona ? (
          <span className="text-base">{currentPersona.icon}</span>
        ) : (
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        )}
      </Button>
    );

    return (
      <>
        {/* Backdrop blur overlay */}
        {open && (
          <Backdrop
            blur="sm"
            className="z-40 duration-200 animate-in fade-in-0"
            variant="default"
          />
        )}

        <TooltipWrapper content={tooltip} open={!open}>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>
            <PopoverContent
              avoidCollisions
              className="w-[min(calc(100vw-2rem),380px)] border-border/50 p-0 shadow-lg data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 dark:shadow-xl dark:shadow-black/20"
              collisionPadding={16}
              side="top"
              sideOffset={4}
            >
              <PersonaList
                currentPersona={currentPersona}
                personas={availablePersonas}
                onPersonaSelect={handlePersonaSelect}
              />
            </PopoverContent>
          </Popover>
        </TooltipWrapper>
      </>
    );
  }

  const TriggerButton = (
    <Button
      aria-expanded={open}
      role="combobox"
      variant="outline"
      className={cn(
        "w-full justify-between group picker-trigger",
        "hover:bg-accent/30 dark:hover:bg-accent/20",
        "hover:border-primary/30 dark:hover:border-primary/30",
        "transition-all duration-200",
        open &&
          "bg-accent/30 dark:bg-accent/20 border-primary/30 dark:border-primary/30",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {currentPersona ? (
          <>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/50 dark:bg-accent/30">
              <span className="text-lg">{currentPersona.icon}</span>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium">{currentPersona.name}</div>
              <div className="text-xs text-muted-foreground">
                {currentPersona.description}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-muted/50 dark:bg-muted/30">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium">Default</div>
              <div className="text-xs text-muted-foreground">
                Standard AI assistant behavior
              </div>
            </div>
          </>
        )}
      </div>
      <CaretDownIcon
        className={cn(
          "h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200",
          open && "rotate-180 text-foreground"
        )}
      />
    </Button>
  );

  return (
    <>
      {/* Backdrop blur overlay */}
      {open && (
        <Backdrop
          blur="sm"
          className="z-40 duration-200 animate-in fade-in-0"
          variant="default"
        />
      )}

      <TooltipWrapper content={tooltip} open={!open}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>
          <PopoverContent
            avoidCollisions
            className="w-[min(calc(100vw-2rem),380px)] border-border/50 p-0 shadow-lg data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 dark:shadow-xl dark:shadow-black/20"
            collisionPadding={16}
            side="top"
            sideOffset={4}
          >
            <PersonaList
              currentPersona={currentPersona}
              personas={availablePersonas}
              onPersonaSelect={handlePersonaSelect}
            />
          </PopoverContent>
        </Popover>
      </TooltipWrapper>
    </>
  );
};

type PersonaListProps = {
  personas:
    | Array<{
        _id: Id<"personas">;
        name: string;
        description: string;
        prompt: string;
        icon?: string;
        isBuiltIn: boolean;
      }>
    | undefined;
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
  // Group personas by built-in vs custom
  const builtInPersonas = personas?.filter(p => p.isBuiltIn) || [];
  const customPersonas = personas?.filter(p => !p.isBuiltIn) || [];

  return (
    <Command className="pt-2">
      <CommandInput placeholder="Search personas..." />
      <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-4">
            <UserIcon className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">No personas found</p>
              <p className="text-xs text-muted-foreground">
                Try searching or create a custom persona
              </p>
            </div>
          </div>
        </CommandEmpty>

        {/* Default option */}
        <CommandGroup>
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Default
          </div>
          <CommandItem
            className="flex min-h-[44px] items-center gap-2 px-4 py-3 transition-colors hover:bg-accent/50 dark:hover:bg-accent/30 sm:min-h-0 sm:px-3 sm:py-2"
            value="default"
            onSelect={() => onPersonaSelect(null)}
          >
            <span className="text-lg">🤖</span>
            <div className="flex-1">
              <div className="font-medium">Default</div>
              <div className="text-xs text-muted-foreground">
                Standard AI assistant behavior
              </div>
            </div>
            {!currentPersona && <CheckIcon className="h-4 w-4 text-primary" />}
          </CommandItem>
        </CommandGroup>

        {/* Built-in personas */}
        {builtInPersonas.length > 0 && (
          <>
            <div className="mx-2 my-1.5 h-px bg-border/50" />
            <CommandGroup>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Built-in
                <span className="ml-2 text-xs text-muted-foreground/60">
                  ({builtInPersonas.length} persona
                  {builtInPersonas.length === 1 ? "" : "s"})
                </span>
              </div>
              {builtInPersonas.map(persona => (
                <CommandItem
                  key={persona._id}
                  className="flex min-h-[44px] items-center gap-2 px-4 py-3 transition-colors hover:bg-accent/50 dark:hover:bg-accent/30 sm:min-h-0 sm:px-3 sm:py-2"
                  value={persona.name}
                  onSelect={() => onPersonaSelect(persona._id)}
                >
                  <span className="text-lg">{persona.icon || "🤖"}</span>
                  <div className="flex-1">
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                  {currentPersona?._id === persona._id && (
                    <CheckIcon className="h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Custom personas */}
        {customPersonas.length > 0 && (
          <>
            <div className="mx-2 my-1.5 h-px bg-border/50" />
            <CommandGroup>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Custom
                <span className="ml-2 text-xs text-muted-foreground/60">
                  ({customPersonas.length} persona
                  {customPersonas.length === 1 ? "" : "s"})
                </span>
              </div>
              {customPersonas.map(persona => (
                <CommandItem
                  key={persona._id}
                  className="flex min-h-[44px] items-center gap-2 px-4 py-3 transition-colors hover:bg-accent/50 dark:hover:bg-accent/30 sm:min-h-0 sm:px-3 sm:py-2"
                  value={persona.name}
                  onSelect={() => onPersonaSelect(persona._id)}
                >
                  <span className="text-lg">{persona.icon || "🤖"}</span>
                  <div className="flex-1">
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                  {currentPersona?._id === persona._id && (
                    <CheckIcon className="h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
};
