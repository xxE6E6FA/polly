import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  FileTextIcon,
  PencilSimpleLineIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConvexMutationWithCache } from "@/hooks/use-convex-cache";
import {
  useOptimisticPersonasGlobalToggle,
  useOptimisticPersonaToggle,
} from "@/hooks/use-optimistic-toggles";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { useUser } from "@/hooks/use-user";
import { useUserSettings } from "@/hooks/use-user-settings";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { SettingsHeader } from "./settings-header";

export const PersonasTab = () => {
  const userInfo = useUser();
  const queryUserId = useQueryUserId();
  const personas = useQuery(
    api.personas.list,
    queryUserId ? { userId: queryUserId } : "skip"
  );
  const allBuiltInPersonas = useQuery(api.personas.listAllBuiltIn);
  const userPersonaSettings = useQuery(
    api.personas.getUserPersonaSettings,
    queryUserId ? { userId: queryUserId } : "skip"
  );
  const userSettings = useUserSettings(userInfo.user?._id);

  // Use optimized mutations for immediate feedback
  const { mutate: toggleBuiltInPersonaOptimistic } =
    useOptimisticPersonaToggle();
  const { mutate: togglePersonasGloballyOptimistic } =
    useOptimisticPersonasGlobalToggle();

  // Use optimized mutation for delete operation
  const { mutateAsync: removePersona } = useConvexMutationWithCache(
    api.personas.remove,
    {
      onSuccess: () => {
        // Success handling is automatic via optimistic updates
      },
      onError: (error: Error) => {
        console.error("Failed to delete persona:", error);
      },
      invalidateQueries: ["personas"],
      invalidationEvents: ["personas-changed"],
    }
  );

  const [deletingPersona, setDeletingPersona] = useState<Id<"personas"> | null>(
    null
  );

  const handleDeletePersona = useCallback(async () => {
    if (!deletingPersona) {
      return;
    }

    try {
      await removePersona({ id: deletingPersona });
      setDeletingPersona(null);
    } catch (error) {
      console.error("Failed to delete persona:", error);
    }
  }, [deletingPersona, removePersona]);

  const handleToggleBuiltInPersona = useCallback(
    (personaId: Id<"personas">, isDisabled: boolean) => {
      // Use optimistic mutation for immediate feedback
      toggleBuiltInPersonaOptimistic({ personaId, isDisabled });
    },
    [toggleBuiltInPersonaOptimistic]
  );

  const isPersonaDisabled = useCallback(
    (personaId: Id<"personas">) => {
      return userPersonaSettings?.some(
        setting => setting.personaId === personaId && setting.isDisabled
      );
    },
    [userPersonaSettings]
  );

  const handleTogglePersonasGlobally = useCallback(
    (enabled: boolean) => {
      // Use optimistic mutation for immediate feedback
      togglePersonasGloballyOptimistic({ enabled });
    },
    [togglePersonasGloballyOptimistic]
  );

  return (
    <TooltipProvider>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <SettingsHeader
            description="Manage custom system prompts for different conversation styles"
            title="Personas"
          />
          <div className="flex shrink-0 gap-2">
            <Link to={ROUTES.SETTINGS.PERSONAS_NEW}>
              <Button size="sm" variant="default">
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Persona
              </Button>
            </Link>
          </div>
        </div>

        {/* Global Personas Toggle */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Enable Personas</h3>
              <p className="text-sm text-muted-foreground">
                Turn personas on or off completely. When disabled, the persona
                picker will be hidden from the chat interface.
              </p>
            </div>
            <Switch
              checked={userSettings?.personasEnabled !== false}
              onCheckedChange={handleTogglePersonasGlobally}
            />
          </div>
        </div>

        {/* Show the rest only if personas are enabled */}
        {userSettings?.personasEnabled !== false && (
          <>
            {/* Built-in Personas Management */}
            {allBuiltInPersonas && allBuiltInPersonas.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Built-in Personas</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {allBuiltInPersonas.map(persona => {
                    const disabled = isPersonaDisabled(persona._id);
                    return (
                      <div
                        key={persona._id}
                        className={cn(
                          "border rounded-lg p-3 transition-opacity",
                          disabled && "opacity-60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            <span className="flex-shrink-0 text-lg">
                              {persona.icon || "🤖"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-sm font-medium">
                                {persona.name}
                              </h4>
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {persona.description}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={!disabled}
                            onCheckedChange={checked =>
                              handleToggleBuiltInPersona(persona._id, !checked)
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* User Custom Personas */}
            {personas?.some(p => !p.isBuiltIn) && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Custom Personas</h3>
                  <p className="text-sm text-muted-foreground">
                    Your custom system prompts for different conversation styles
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  {personas
                    .filter(persona => !persona.isBuiltIn)
                    .map(persona => (
                      <div
                        key={persona._id}
                        className="space-y-3 rounded-lg border p-3 sm:p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <span className="flex-shrink-0 text-xl">
                              {persona.icon || "🤖"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-semibold">
                                {persona.name}
                              </h4>
                              {persona.description && (
                                <p className="text-xs text-muted-foreground">
                                  {persona.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 gap-1">
                            <Dialog>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <DialogTrigger asChild>
                                    <Button size="sm" variant="ghost">
                                      <FileTextIcon className="h-3 w-3" />
                                    </Button>
                                  </DialogTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                  View system prompt
                                </TooltipContent>
                              </Tooltip>
                              <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-h-[80vh] sm:max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <span className="text-lg">
                                      {persona.icon || "🤖"}
                                    </span>
                                    {persona.name} - System Prompt
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 overflow-auto rounded-lg bg-muted/20 p-4">
                                  <StreamingMarkdown>
                                    {persona.prompt}
                                  </StreamingMarkdown>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  to={ROUTES.SETTINGS.PERSONAS_EDIT(
                                    persona._id
                                  )}
                                >
                                  <Button size="sm" variant="ghost">
                                    <PencilSimpleLineIcon className="h-3 w-3" />
                                  </Button>
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>Edit persona</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  className="text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setDeletingPersona(persona._id)
                                  }
                                >
                                  <TrashIcon className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete persona</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Empty State for Custom Personas */}
            {personas && personas.filter(p => !p.isBuiltIn).length === 0 && (
              <div className="rounded-lg border border-dashed py-8 text-center">
                <UserIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">
                  No Custom Personas
                </h3>
                <p className="mb-4 text-muted-foreground">
                  Create your first custom persona to define specialized AI
                  behavior
                </p>
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation */}
        <ConfirmationDialog
          cancelText="Cancel"
          confirmText="Delete"
          description="Are you sure you want to delete this persona? This action cannot be undone."
          open={Boolean(deletingPersona)}
          title="Delete Persona"
          onConfirm={handleDeletePersona}
          onOpenChange={open => !open && setDeletingPersona(null)}
        />
      </div>
    </TooltipProvider>
  );
};
