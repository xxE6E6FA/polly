import { useState } from "react";
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
import { Check, User, ChevronDown } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import { Id } from "../../convex/_generated/dataModel";

interface PersonaPickerProps {
  compact?: boolean;
  className?: string;
  selectedPersonaId?: Id<"personas"> | null;
  onPersonaSelect?: (personaId: Id<"personas"> | null) => void;
}

export function PersonaPicker({
  compact = false,
  className,
  selectedPersonaId = null,
  onPersonaSelect,
}: PersonaPickerProps) {
  const userInfo = useUser();
  const personas = useQuery(
    api.personas.list,
    userInfo.user?._id ? { userId: userInfo.user._id } : "skip"
  );
  const userPersonaSettings = useQuery(
    api.personas.getUserPersonaSettings,
    userInfo.user?._id
      ? {
          userId: userInfo.user._id,
        }
      : "skip"
  );

  const [open, setOpen] = useState(false);

  // Filter out disabled personas
  const availablePersonas = personas?.filter(persona => {
    const isDisabled = userPersonaSettings?.some(
      setting => setting.personaId === persona._id && setting.isDisabled
    );
    return !isDisabled;
  });

  const handlePersonaSelect = async (personaId: Id<"personas"> | null) => {
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
    return (
      <>
        {/* Backdrop blur overlay */}
        {open && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in-0 duration-200" />
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0 relative group picker-trigger",
                "hover:bg-accent/50 dark:hover:bg-accent/30",
                "transition-all duration-200",
                open && "bg-accent/50 dark:bg-accent/30",
                className
              )}
              title={currentPersona ? currentPersona.name : "Default"}
            >
              {currentPersona ? (
                <span className="text-base">{currentPersona.icon}</span>
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[min(calc(100vw-2rem),380px)] p-0 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 border-border/50 shadow-lg dark:shadow-xl dark:shadow-black/20"
            side="top"
            sideOffset={4}
            collisionPadding={16}
            avoidCollisions={true}
          >
            <PersonaList
              personas={availablePersonas}
              currentPersona={currentPersona}
              onPersonaSelect={handlePersonaSelect}
            />
          </PopoverContent>
        </Popover>
      </>
    );
  }

  return (
    <>
      {/* Backdrop blur overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in-0 duration-200" />
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
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
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/50 dark:bg-accent/30">
                    <span className="text-lg">{currentPersona.icon}</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">
                      {currentPersona.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {currentPersona.description}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted/50 dark:bg-muted/30 border border-border/50">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">Default</div>
                    <div className="text-xs text-muted-foreground">
                      Standard AI assistant behavior
                    </div>
                  </div>
                </>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200",
                open && "rotate-180 text-foreground"
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(calc(100vw-2rem),380px)] p-0 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-4 border-border/50 shadow-lg dark:shadow-xl dark:shadow-black/20"
          side="top"
          sideOffset={4}
          collisionPadding={16}
          avoidCollisions={true}
        >
          <PersonaList
            personas={availablePersonas}
            currentPersona={currentPersona}
            onPersonaSelect={handlePersonaSelect}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

interface PersonaListProps {
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
}

function PersonaList({
  personas,
  currentPersona,
  onPersonaSelect,
}: PersonaListProps) {
  // Group personas by built-in vs custom
  const builtInPersonas = personas?.filter(p => p.isBuiltIn) || [];
  const customPersonas = personas?.filter(p => !p.isBuiltIn) || [];

  return (
    <Command className="pt-2">
      <CommandInput placeholder="Search personas..." />
      <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-4">
            <User className="h-8 w-8 text-muted-foreground" />
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
            value="default"
            onSelect={() => onPersonaSelect(null)}
            className="flex items-center gap-2 py-3 sm:py-2 px-4 sm:px-3 min-h-[44px] sm:min-h-0 hover:bg-accent/50 dark:hover:bg-accent/30 transition-colors"
          >
            <span className="text-lg">🤖</span>
            <div className="flex-1">
              <div className="font-medium">Default</div>
              <div className="text-xs text-muted-foreground">
                Standard AI assistant behavior
              </div>
            </div>
            {!currentPersona && <Check className="h-4 w-4 text-primary" />}
          </CommandItem>
        </CommandGroup>

        {/* Built-in personas */}
        {builtInPersonas.length > 0 && (
          <>
            <div className="h-px bg-border/50 mx-2 my-1.5" />
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
                  value={persona.name}
                  onSelect={() => onPersonaSelect(persona._id)}
                  className="flex items-center gap-2 py-3 sm:py-2 px-4 sm:px-3 min-h-[44px] sm:min-h-0 hover:bg-accent/50 dark:hover:bg-accent/30 transition-colors"
                >
                  <span className="text-lg">{persona.icon || "🤖"}</span>
                  <div className="flex-1">
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                  {currentPersona?._id === persona._id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Custom personas */}
        {customPersonas.length > 0 && (
          <>
            <div className="h-px bg-border/50 mx-2 my-1.5" />
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
                  value={persona.name}
                  onSelect={() => onPersonaSelect(persona._id)}
                  className="flex items-center gap-2 py-3 sm:py-2 px-4 sm:px-3 min-h-[44px] sm:min-h-0 hover:bg-accent/50 dark:hover:bg-accent/30 transition-colors"
                >
                  <span className="text-lg">{persona.icon || "🤖"}</span>
                  <div className="flex-1">
                    <div className="font-medium">{persona.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {persona.description}
                    </div>
                  </div>
                  {currentPersona?._id === persona._id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
