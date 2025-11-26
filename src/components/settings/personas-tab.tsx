import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { EnrichedPersona } from "@convex/personas";
import {
  CaretDownIcon,
  CaretUpIcon,
  FileTextIcon,
  PencilSimpleLineIcon,
  PlusIcon,
  ToggleLeftIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ListEmptyState,
  type MobileDrawerConfig,
  VirtualizedDataList,
  type VirtualizedDataListColumn,
} from "@/components/data-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StreamingMarkdown } from "@/components/ui/streaming-markdown";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SortDirection } from "@/hooks/use-list-sort";
import { useUserSettings } from "@/hooks/use-user-settings";
import { ROUTES } from "@/lib/routes";
import { isUserSettings } from "@/lib/type-guards";
import { useToast } from "@/providers/toast-context";
import { SettingsHeader } from "./settings-header";
import { SettingsPageLayout } from "./ui/SettingsPageLayout";

type SortField = "name" | "type";

export const PersonasTab = () => {
  const navigate = useNavigate();
  const userSettingsRaw = useUserSettings();
  const managedToast = useToast();

  const userSettings = isUserSettings(userSettingsRaw) ? userSettingsRaw : null;
  const isSettingsLoading = userSettingsRaw === undefined;

  // Mutations for toggling and deleting
  const toggleBuiltInPersonaMutation = useMutation(
    api.personas.toggleBuiltInPersona
  );
  const togglePersonaMutation = useMutation(api.personas.togglePersona);
  const togglePersonasGloballyMutation = useMutation(
    api.userSettings.togglePersonasEnabled
  );
  const removePersonaMutation = useMutation(api.personas.remove);

  // Local state for dialogs
  const [deletingPersona, setDeletingPersona] = useState<Id<"personas"> | null>(
    null
  );
  const [viewingPersona, setViewingPersona] = useState<EnrichedPersona | null>(
    null
  );

  // Sort state for server-side sorting
  const [sortField, setSortField] = useState<SortField>("type");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField]
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

  // Column definitions
  const columns: VirtualizedDataListColumn<EnrichedPersona, SortField>[] =
    useMemo(
      () => [
        {
          key: "persona",
          label: "Persona",
          sortable: true,
          sortField: "name" as SortField,
          width: "minmax(200px, 1fr)",
          render: (persona: EnrichedPersona) => {
            const isDisabled =
              persona.type === "built-in"
                ? persona.isDisabled
                : !persona.isActive;
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
          sortField: "type" as SortField,
          width: "w-28",
          hideOnMobile: true,
          render: (persona: EnrichedPersona) => (
            <Badge
              variant={persona.type === "built-in" ? "secondary" : "default"}
            >
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
          render: (persona: EnrichedPersona) => (
            <div className="flex justify-center">
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
          ),
        },
        {
          key: "actions",
          label: "",
          width: "w-32",
          className: "text-right",
          hideOnMobile: true,
          render: (persona: EnrichedPersona) => (
            <div className="flex justify-end gap-1">
              {persona.type === "custom" && (
                <>
                  <Tooltip>
                    <TooltipTrigger>
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
                    <TooltipTrigger>
                      <Link
                        to={ROUTES.SETTINGS.PERSONAS_EDIT(persona._id)}
                        onClick={e => e.stopPropagation()}
                      >
                        <Button size="sm" variant="ghost">
                          <PencilSimpleLineIcon className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>Edit persona</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
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
      ],
      [handleTogglePersona]
    );

  // Mobile drawer configuration
  const mobileDrawerConfig: MobileDrawerConfig<EnrichedPersona> = useMemo(
    () => ({
      title: (persona: EnrichedPersona) => persona.name,
      subtitle: (persona: EnrichedPersona) =>
        persona.type === "built-in" ? "Built-in persona" : "Custom persona",
      actions: [
        {
          key: "status",
          icon: ToggleLeftIcon,
          label: (persona: EnrichedPersona) => {
            const isActive =
              persona.type === "built-in"
                ? !persona.isDisabled
                : persona.isActive;
            return isActive ? "Enabled" : "Disabled";
          },
          onClick: () => {
            // onClick is required but unused for toggle actions
          },
          toggle: {
            checked: (persona: EnrichedPersona) =>
              persona.type === "built-in"
                ? !persona.isDisabled
                : persona.isActive,
            onCheckedChange: handleTogglePersona,
          },
        },
        {
          key: "view-prompt",
          icon: FileTextIcon,
          label: "View system prompt",
          onClick: (persona: EnrichedPersona) => setViewingPersona(persona),
          hidden: (persona: EnrichedPersona) => persona.type !== "custom",
        },
        {
          key: "edit",
          icon: PencilSimpleLineIcon,
          label: "Edit persona",
          onClick: (persona: EnrichedPersona) =>
            navigate(ROUTES.SETTINGS.PERSONAS_EDIT(persona._id)),
          hidden: (persona: EnrichedPersona) => persona.type !== "custom",
        },
        {
          key: "delete",
          icon: TrashIcon,
          label: "Delete persona",
          onClick: (persona: EnrichedPersona) =>
            setDeletingPersona(persona._id),
          hidden: (persona: EnrichedPersona) => persona.type !== "custom",
          className:
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
        },
      ],
    }),
    [handleTogglePersona, navigate]
  );

  // Mobile title renderer
  const mobileTitleRender = useCallback((persona: EnrichedPersona) => {
    const isDisabled =
      persona.type === "built-in" ? persona.isDisabled : !persona.isActive;
    return (
      <div className="flex items-start gap-3">
        <span
          className={`text-xl flex-shrink-0 ${isDisabled ? "opacity-50" : ""}`}
        >
          {persona.icon || "🤖"}
        </span>
        <div className="min-w-0">
          <div
            className={`font-medium truncate ${isDisabled ? "text-muted-foreground" : ""}`}
          >
            {persona.name}
          </div>
          <div className="text-sm text-muted-foreground break-words">
            {persona.description}
          </div>
        </div>
      </div>
    );
  }, []);

  // Mobile metadata renderer - shows type badge
  const mobileMetadataRender = useCallback(
    (persona: EnrichedPersona) => (
      <Badge variant={persona.type === "built-in" ? "secondary" : "default"}>
        {persona.type === "built-in" ? "Built-in" : "Custom"}
      </Badge>
    ),
    []
  );

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
            disabled={isSettingsLoading}
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
            <Link to={ROUTES.SETTINGS.PERSONAS_NEW}>
              <Button size="sm" variant="default">
                <PlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Create Persona</span>
              </Button>
            </Link>
          </div>

          {/* VirtualizedDataList for all personas */}
          <VirtualizedDataList<EnrichedPersona, SortField>
            query={api.personas.listForSettingsPaginated}
            queryArgs={{ sortField, sortDirection }}
            columns={columns}
            getItemKey={persona => persona._id}
            sort={{
              field: sortField,
              direction: sortDirection,
              onSort: handleSort,
            }}
            sortIcons={{
              asc: CaretUpIcon,
              desc: CaretDownIcon,
            }}
            mobileTitleRender={mobileTitleRender}
            mobileMetadataRender={mobileMetadataRender}
            mobileDrawerConfig={mobileDrawerConfig}
            emptyState={
              <ListEmptyState
                icon={<UserIcon className="h-12 w-12" />}
                title="No Personas"
                description="Create your first custom persona to define specialized AI behavior"
                action={
                  <Link to={ROUTES.SETTINGS.PERSONAS_NEW}>
                    <Button variant="default">
                      <PlusIcon className="mr-2 h-4 w-4" />
                      Create Persona
                    </Button>
                  </Link>
                }
              />
            }
          />
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
