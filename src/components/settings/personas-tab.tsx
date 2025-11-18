/** biome-ignore-all lint/suspicious/noArrayIndexKey: acceptable for skeletons */
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  CaretDownIcon,
  CaretUpIcon,
  FileTextIcon,
  PencilSimpleLineIcon,
  PlusIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DataList,
  type DataListColumn,
  ListEmptyState,
  ListLoadingState,
} from "@/components/data-list";
import { Badge } from "@/components/ui/badge";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useListSort } from "@/hooks/use-list-sort";
import { useUserSettings } from "@/hooks/use-user-settings";
import { ROUTES } from "@/lib/routes";
import { isPersonaArray, isUserSettings } from "@/lib/type-guards";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import { SettingsHeader } from "./settings-header";
import { SettingsPageLayout } from "./ui/SettingsPageLayout";

type PersonaType = "built-in" | "custom";
type SortField = "name" | "type";

interface EnrichedPersona {
  _id: Id<"personas">;
  _creationTime: number;
  name: string;
  description: string;
  prompt: string;
  icon?: string;
  ttsVoiceId?: string;
  isBuiltIn: boolean;
  isActive: boolean;
  type: PersonaType;
  isDisabled: boolean;
}

export const PersonasTab = () => {
  const { user } = useUserDataContext();
  const personasRaw = useQuery(
    api.personas.listAllForSettings,
    user?._id ? {} : "skip"
  );
  const allBuiltInPersonasRaw = useQuery(
    api.personas.listAllBuiltInForSettings,
    {}
  );
  const userPersonaSettingsRaw = useQuery(
    api.personas.getUserPersonaSettings,
    user?._id ? {} : "skip"
  );
  const userSettingsRaw = useUserSettings();
  const managedToast = useToast();

  // Apply type guards
  const personas = isPersonaArray(personasRaw) ? personasRaw : [];
  const allBuiltInPersonas = isPersonaArray(allBuiltInPersonasRaw)
    ? allBuiltInPersonasRaw
    : [];
  const userPersonaSettings = Array.isArray(userPersonaSettingsRaw)
    ? userPersonaSettingsRaw
    : [];
  const userSettings = isUserSettings(userSettingsRaw) ? userSettingsRaw : null;

  // Direct Convex mutations for toggling
  const toggleBuiltInPersonaMutation = useMutation(
    api.personas.toggleBuiltInPersona
  );
  const togglePersonaMutation = useMutation(api.personas.togglePersona);
  const togglePersonasGloballyMutation = useMutation(
    api.userSettings.togglePersonasEnabled
  );
  const removePersonaMutation = useMutation(api.personas.remove);

  const [deletingPersona, setDeletingPersona] = useState<Id<"personas"> | null>(
    null
  );
  const [viewingPersona, setViewingPersona] = useState<EnrichedPersona | null>(
    null
  );

  // Helper function to check if a persona is disabled
  const isPersonaDisabled = useCallback(
    (personaId: Id<"personas">) => {
      return userPersonaSettings.some(
        setting => setting.personaId === personaId && setting.isDisabled
      );
    },
    [userPersonaSettings]
  );

  // Combine built-in and custom personas into enriched list
  const enrichedPersonas = useMemo<EnrichedPersona[]>(() => {
    const builtInEnriched: EnrichedPersona[] = allBuiltInPersonas.map(p => ({
      ...p,
      type: "built-in" as PersonaType,
      isDisabled: isPersonaDisabled(p._id),
    }));

    const customEnriched: EnrichedPersona[] = personas
      .filter(p => !p.isBuiltIn)
      .map(p => ({
        ...p,
        type: "custom" as PersonaType,
        isDisabled: false,
      }));

    return [...builtInEnriched, ...customEnriched];
  }, [allBuiltInPersonas, personas, isPersonaDisabled]);

  // Sorting with stable secondary sort by creation time
  const { sortField, sortDirection, toggleSort, sortItems } = useListSort<
    SortField,
    EnrichedPersona
  >(
    "type",
    "asc",
    (persona, field) => {
      if (field === "name") {
        return persona.name.toLowerCase();
      }
      if (field === "type") {
        return persona.type === "built-in" ? 0 : 1;
      }
      return "";
    },
    persona => persona._creationTime
  );

  const sortedPersonas = useMemo(
    () => sortItems(enrichedPersonas),
    [sortItems, enrichedPersonas]
  );

  // Handlers
  const handleDeletePersona = useCallback(
    async (personaId: Id<"personas">) => {
      try {
        await removePersonaMutation({ id: personaId });
      } catch (_error) {
        managedToast.error("Failed to delete persona");
      } finally {
        setDeletingPersona(null);
      }
    },
    [removePersonaMutation, managedToast]
  );

  const handleTogglePersona = useCallback(
    (persona: EnrichedPersona, checked: boolean) => {
      if (persona.type === "built-in") {
        toggleBuiltInPersonaMutation({
          personaId: persona._id,
          isDisabled: !checked,
        });
      } else {
        togglePersonaMutation({
          id: persona._id,
          isActive: checked,
        });
      }
    },
    [toggleBuiltInPersonaMutation, togglePersonaMutation]
  );

  const handleTogglePersonasGlobally = useCallback(
    (enabled: boolean) => {
      togglePersonasGloballyMutation({ enabled });
    },
    [togglePersonasGloballyMutation]
  );

  // Check if data is still loading
  const isLoading =
    personasRaw === undefined ||
    allBuiltInPersonasRaw === undefined ||
    userSettingsRaw === undefined;

  // Define DataList columns
  const columns: DataListColumn<EnrichedPersona, SortField>[] = [
    {
      key: "persona",
      label: "Persona",
      sortable: true,
      sortField: "name",
      width: "minmax(200px, 1fr)",
      render: persona => {
        const isDisabled =
          persona.type === "built-in" ? persona.isDisabled : !persona.isActive;
        return (
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`text-xl flex-shrink-0 ${isDisabled ? "opacity-50" : ""}`}
            >
              {persona.icon || "🤖"}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={`font-medium truncate ${isDisabled ? "text-muted-foreground" : ""}`}
              >
                {persona.name}
              </div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                {persona.description}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      sortField: "type",
      width: "w-28",
      hideOnMobile: true,
      render: persona => (
        <Badge variant={persona.type === "built-in" ? "secondary" : "default"}>
          {persona.type === "built-in" ? "Built-in" : "Custom"}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "",
      width: "w-24",
      className: "text-center",
      hideOnMobile: true,
      render: persona => (
        <div className="flex justify-center">
          <Switch
            checked={
              persona.type === "built-in"
                ? !persona.isDisabled
                : persona.isActive
            }
            onCheckedChange={checked => handleTogglePersona(persona, checked)}
          />
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      width: "w-32",
      className: "text-right",
      hideOnMobile: true,
      render: persona => (
        <div className="flex justify-end gap-1">
          {persona.type === "custom" && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={e => {
                      e.stopPropagation();
                      setViewingPersona(persona);
                    }}
                  >
                    <FileTextIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View system prompt</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" asChild>
                    <Link
                      to={ROUTES.SETTINGS.PERSONAS_EDIT(persona._id)}
                      onClick={e => e.stopPropagation()}
                    >
                      <PencilSimpleLineIcon className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit persona</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      setDeletingPersona(persona._id);
                    }}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete persona</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <SettingsPageLayout>
      <SettingsHeader
        description="Manage custom system prompts for different conversation styles"
        title="Personas"
      />

      {/* Global Personas Toggle */}
      <div className="rounded-lg bg-muted/20 p-4 shadow-sm ring-1 ring-border/30">
        <div className="flex items-start justify-between gap-4">
          <div className="stack-sm flex-1">
            <h3 className="text-base font-semibold">Enable Personas</h3>
            <p className="text-sm text-muted-foreground">
              Turn personas on or off completely. When disabled, the persona
              picker will be hidden from the chat interface.
            </p>
          </div>
          <Switch
            checked={userSettings?.personasEnabled !== false}
            onCheckedChange={handleTogglePersonasGlobally}
            disabled={isLoading}
            className="flex-shrink-0"
          />
        </div>
      </div>

      {/* Show the rest only if personas are enabled */}
      {userSettings?.personasEnabled !== false && (
        <div className="stack-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">All Personas</h3>
              <p className="text-sm text-muted-foreground">
                Built-in and custom system prompts in one place
              </p>
            </div>
            <Button asChild size="sm" variant="default">
              <Link to={ROUTES.SETTINGS.PERSONAS_NEW}>
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Create Persona</span>
              </Link>
            </Button>
          </div>

          {isLoading && <ListLoadingState count={6} />}
          {!isLoading && enrichedPersonas.length === 0 && (
            <ListEmptyState
              icon={<UserIcon className="h-12 w-12" />}
              title="No Personas"
              description="Create your first custom persona to define specialized AI behavior"
              action={
                <Button asChild variant="default">
                  <Link to={ROUTES.SETTINGS.PERSONAS_NEW}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Create Persona
                  </Link>
                </Button>
              }
            />
          )}
          {!isLoading && enrichedPersonas.length > 0 && (
            <DataList
              items={sortedPersonas}
              getItemKey={persona => persona._id}
              columns={columns}
              sort={{
                field: sortField,
                direction: sortDirection,
                onSort: toggleSort,
              }}
              sortIcons={{ asc: CaretUpIcon, desc: CaretDownIcon }}
              mobileTitleRender={persona => {
                const isDisabled =
                  persona.type === "built-in"
                    ? persona.isDisabled
                    : !persona.isActive;
                return (
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-lg flex-shrink-0 ${isDisabled ? "opacity-50" : ""}`}
                    >
                      {persona.icon || "🤖"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`font-medium truncate ${isDisabled ? "text-muted-foreground" : ""}`}
                      >
                        {persona.name}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {persona.description}
                      </div>
                    </div>
                  </div>
                );
              }}
              mobileActionsRender={persona => (
                <>
                  {persona.type === "custom" && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={e => {
                          e.stopPropagation();
                          setViewingPersona(persona);
                        }}
                      >
                        <FileTextIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link
                          to={ROUTES.SETTINGS.PERSONAS_EDIT(persona._id)}
                          onClick={e => e.stopPropagation()}
                        >
                          <PencilSimpleLineIcon className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={e => {
                          e.stopPropagation();
                          setDeletingPersona(persona._id);
                        }}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </>
              )}
              mobileMetadataRender={persona => (
                <div className="flex items-center gap-3 text-xs">
                  <Badge
                    variant={
                      persona.type === "built-in" ? "secondary" : "default"
                    }
                    className="text-xs"
                  >
                    {persona.type === "built-in" ? "Built-in" : "Custom"}
                  </Badge>
                  <Switch
                    checked={
                      persona.type === "built-in"
                        ? !persona.isDisabled
                        : persona.isActive
                    }
                    onCheckedChange={checked =>
                      handleTogglePersona(persona, checked)
                    }
                  />
                </div>
              )}
            />
          )}
        </div>
      )}

      {/* View System Prompt Dialog */}
      <Dialog
        open={Boolean(viewingPersona)}
        onOpenChange={open => !open && setViewingPersona(null)}
      >
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-h-[80vh] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-lg">{viewingPersona?.icon || "🤖"}</span>
              {viewingPersona?.name} - System Prompt
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-lg bg-muted/20 p-4">
            <StreamingMarkdown>
              {viewingPersona?.prompt || ""}
            </StreamingMarkdown>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        cancelText="Cancel"
        confirmText="Delete"
        description="Are you sure you want to delete this persona? This action cannot be undone."
        open={Boolean(deletingPersona)}
        title="Delete Persona"
        onConfirm={() => {
          if (deletingPersona) {
            void handleDeletePersona(deletingPersona);
          }
        }}
        onOpenChange={open => !open && setDeletingPersona(null)}
      />
    </SettingsPageLayout>
  );
};
