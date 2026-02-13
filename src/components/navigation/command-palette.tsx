import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChatCircleIcon,
  CloudArrowDownIcon,
  EyeSlashIcon,
  FileCodeIcon,
  FileTextIcon,
  GearIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PaperclipIcon,
  PencilSimpleIcon,
  PlusIcon,
  PushPinIcon,
  RobotIcon,
  ShareNetworkIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Backdrop } from "@/components/ui/backdrop";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ControlledShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import { Spinner } from "@/components/ui/spinner";
import { TextInputDialog } from "@/components/ui/text-input-dialog";
import { useArchiveConversation } from "@/hooks/use-archive-conversation";
import { useConversationImport } from "@/hooks/use-conversation-import";
import { useDebounce } from "@/hooks/use-debounce";
import { useDeleteConversation } from "@/hooks/use-delete-conversation";
import { useModelCatalog } from "@/hooks/use-model-catalog";
import { useOnline } from "@/hooks/use-online";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useTheme } from "@/hooks/use-theme";
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "@/lib/export";
import { ROUTES } from "@/lib/routes";
import { useToast } from "@/providers/toast-context";
import { useUserIdentity } from "@/providers/user-data-context";
import type { ConversationId, HydratedModel } from "@/types";
import { CommandPaletteConversationActions } from "./command-palette-conversation-actions";
import { CommandPaletteConversationBrowser } from "./command-palette-conversation-browser";
import { CommandPaletteMainMenu } from "./command-palette-main-menu";
import { CommandPaletteModelBrowser } from "./command-palette-model-browser";
import type {
  Action,
  ConversationType,
  ModelType,
  NavigationState,
} from "./command-palette-types";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
};

type AvailableModel = HydratedModel;

function getCommandInputPlaceholder(
  currentMenu: NavigationState["currentMenu"]
): string {
  if (currentMenu === "conversation-actions") {
    return "Search actions...";
  }
  if (currentMenu === "model-categories") {
    return "Search models...";
  }
  if (currentMenu === "conversation-browser") {
    return "Search conversations...";
  }
  return "Search conversations, switch models, or take actions...";
}

export function CommandPalette({
  open,
  onOpenChange,
  onClose,
}: CommandPaletteProps) {
  const online = useOnline();
  const [search, setSearch] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [navigation, setNavigation] = useState<NavigationState>({
    currentMenu: "main",
  });

  const debouncedSearch = useDebounce(search, 300);
  const deferredSearch = useDeferredValue(search);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated } = useUserIdentity();

  const currentConversationId = params.conversationId;
  const isConversationPage = location.pathname.startsWith("/chat/");

  // Helper function to close the command palette and call onClose callback
  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Call onClose callback after a brief delay to allow the palette to close first
    if (onClose) {
      setTimeout(onClose, 150); // Match the transition duration
    }
  }, [onOpenChange, onClose]);

  // Helper to reset command palette state
  const resetCommandState = useCallback(() => {
    // Use a small delay to ensure DOM is updated
    setTimeout(() => {
      setSelectedValue(""); // Reset active selection
      // Reset scroll position
      if (commandListRef.current) {
        commandListRef.current.scrollTop = 0;
      }
    }, 0);
  }, []);

  // Navigation helpers
  const navigateToMenu = useCallback(
    (
      menu: NavigationState["currentMenu"],
      conversationId?: string,
      breadcrumb?: string
    ) => {
      setNavigation({
        currentMenu: menu,
        selectedConversationId: conversationId,
        breadcrumb,
      });
      setSearch(""); // Clear search when navigating
      resetCommandState();
    },
    [resetCommandState]
  );

  const navigateBack = useCallback(() => {
    setNavigation({ currentMenu: "main" });
    setSearch(""); // Clear search when going back
    resetCommandState();
  }, [resetCommandState]);

  const searchResults = useQuery(
    api.conversations.search,
    debouncedSearch.trim()
      ? {
          searchQuery: debouncedSearch,
          limit: 20,
          includeArchived: false,
        }
      : "skip"
  );

  const recentConversations = useQuery(api.conversations.list, {
    paginationOpts: { numItems: 8, cursor: null },
    includeArchived: false,
  });

  const allConversations = useQuery(
    api.conversations.list,
    navigation.currentMenu === "conversation-browser"
      ? {
          paginationOpts: { numItems: 50, cursor: null },
          includeArchived: true,
        }
      : "skip"
  );

  const { userModels, modelGroups } = useModelCatalog();
  const modelsLoaded = !!userModels;
  const { selectedModel: currentSelectedModel } = useSelectedModel();
  const recentlyUsedModels = useQuery(api.userModels.getRecentlyUsedModels, {
    limit: 8,
  });

  const patchConversation = useMutation(api.conversations.patch);

  const currentConversation = useQuery(
    api.conversations.getBySlug,
    currentConversationId ? { slug: currentConversationId } : "skip"
  );

  const { deleteConversation: performDelete } = useDeleteConversation({
    currentConversationId: currentConversation?.resolvedId as
      | ConversationId
      | undefined,
  });

  const { archiveConversation: performArchive, unarchiveConversation } =
    useArchiveConversation({
      currentConversationId: currentConversation?.resolvedId as
        | ConversationId
        | undefined,
    });

  const managedToast = useToast();
  const conversationImport = useConversationImport();

  const allModels: ModelType[] = useMemo(() => {
    const combined: AvailableModel[] = [
      ...(modelGroups?.freeModels ?? []),
      ...Object.values(modelGroups?.providerModels ?? {}).flat(),
    ];
    const map = new Map<string, AvailableModel>();
    combined.forEach(model => {
      const key = `${model.provider}-${model.modelId}`;
      map.set(key, model);
    });
    return Array.from(map.values());
  }, [modelGroups]);

  const { selectModel } = useSelectedModel();

  const handleSelectModel = useCallback(
    async (modelId: string, provider: string) => {
      await selectModel(modelId, provider, allModels);
      handleClose();
    },
    [selectModel, allModels, handleClose]
  );

  const handleNavigateToConversation = useCallback(
    (conversationId: string) => {
      navigate(`/chat/${conversationId}`);
      handleClose();
    },
    [navigate, handleClose]
  );

  const handleConversationActions = useCallback(
    (conversationId: string, title: string) => {
      navigateToMenu("conversation-actions", conversationId, title);
    },
    [navigateToMenu]
  );

  const actionConversationSlug =
    navigation.selectedConversationId ?? currentConversationId ?? null;

  const actionConversation = useQuery(
    api.conversations.getBySlug,
    actionConversationSlug ? { slug: actionConversationSlug } : "skip"
  );

  // Get the resolved Convex ID for mutations
  const actionConversationId = actionConversation?.resolvedId ?? null;

  const resolvedActionContext =
    navigation.selectedConversationId && actionConversation
      ? actionConversation
      : currentConversation;

  const handleToggleFavorite = useCallback(async () => {
    const conversationId = actionConversationId;
    const conversation = resolvedActionContext;

    if (!(conversationId && conversation?.conversation)) {
      return;
    }

    try {
      await patchConversation({
        id: conversationId as Id<"conversations">,
        updates: { isPinned: !conversation.conversation.isPinned },
      });

      if (navigation.currentMenu === "conversation-actions") {
        navigateBack();
      } else {
        handleClose();
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  }, [
    actionConversationId,
    resolvedActionContext,
    navigation.currentMenu,
    patchConversation,
    navigateBack,
    handleClose,
  ]);

  const handleToggleArchive = useCallback(async () => {
    const conversationId = actionConversationId;
    const conversation = resolvedActionContext;

    if (!(conversationId && conversation?.conversation)) {
      return;
    }

    const isArchiving = !conversation.conversation.isArchived;

    try {
      if (isArchiving) {
        await performArchive(conversationId as ConversationId);
        managedToast.success("Conversation archived", {
          id: `archive-${conversationId}`,
          duration: 5000,
          isUndo: true,
          action: {
            label: "Undo",
            onClick: () => {
              unarchiveConversation(conversationId as ConversationId);
            },
          },
        });
      } else {
        // Unarchiving (from conversation browser)
        await unarchiveConversation(conversationId as ConversationId);
      }

      if (navigation.currentMenu === "conversation-actions") {
        navigateBack();
      } else {
        handleClose();
      }
    } catch (error) {
      console.error("Failed to toggle archive:", error);
    }
  }, [
    actionConversationId,
    resolvedActionContext,
    navigation.currentMenu,
    performArchive,
    unarchiveConversation,
    managedToast,
    navigateBack,
    handleClose,
  ]);

  const handleShareConversation = useCallback(() => {
    setIsShareDialogOpen(true);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleDeleteConversation = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDeleteConversation = useCallback(async () => {
    const conversationId = actionConversationId;
    const conversation = resolvedActionContext;

    if (!(conversationId && conversation?.conversation)) {
      return;
    }

    let undone = false;

    try {
      // Archive first (hides from UI)
      await performArchive(conversationId as ConversationId);

      if (navigation.currentMenu === "conversation-actions") {
        navigateBack();
      } else {
        handleClose();
      }

      managedToast.success("Conversation deleted", {
        id: `delete-${conversationId}`,
        duration: 5000,
        isUndo: true,
        action: {
          label: "Undo",
          onClick: () => {
            undone = true;
            unarchiveConversation(conversationId as ConversationId);
          },
        },
        onAutoClose: async () => {
          if (!undone) {
            try {
              await performDelete(conversationId as ConversationId);
            } catch {
              managedToast.error("Failed to delete conversation", {
                id: `delete-error-${conversationId}`,
              });
            }
          }
        },
      });
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  }, [
    actionConversationId,
    resolvedActionContext,
    navigation.currentMenu,
    performArchive,
    performDelete,
    unarchiveConversation,
    managedToast,
    navigateBack,
    handleClose,
  ]);

  const handleRenameConversation = useCallback(() => {
    setRenameDialogOpen(true);
  }, []);

  const confirmRenameConversation = useCallback(
    async (newTitle: string) => {
      const conversationId = actionConversationId;
      const conversation = resolvedActionContext;

      if (!(conversationId && conversation?.conversation)) {
        return;
      }

      if (newTitle && newTitle !== conversation.conversation.title) {
        try {
          await patchConversation({
            id: conversationId as Id<"conversations">,
            updates: { title: newTitle },
          });
        } catch (error) {
          console.error("Failed to rename conversation:", error);
        }
      }

      if (navigation.currentMenu === "conversation-actions") {
        navigateBack();
      } else {
        handleClose();
      }
    },
    [
      actionConversationId,
      navigation.currentMenu,
      resolvedActionContext,
      patchConversation,
      navigateBack,
      handleClose,
    ]
  );

  const [exportConversationId, setExportConversationId] = useState<
    string | null
  >(null);
  const [exportFormat, setExportFormat] = useState<"json" | "md" | null>(null);

  const exportData = useQuery(
    api.conversations.getForExport,
    exportConversationId ? { id: exportConversationId } : "skip"
  );

  useEffect(() => {
    if (exportData && exportFormat && exportConversationId) {
      try {
        const { conversation, messages } = exportData;
        const content =
          exportFormat === "json"
            ? exportAsJSON({ conversation, messages })
            : exportAsMarkdown({ conversation, messages });
        const mimeType =
          exportFormat === "json" ? "application/json" : "text/markdown";
        const filename = generateFilename(conversation.title, exportFormat);

        downloadFile(content, filename, mimeType);
      } catch (error) {
        console.error("Export failed:", error);
      } finally {
        setExportConversationId(null);
        setExportFormat(null);
        setTimeout(() => setExportingFormat(null), 500);
      }
    }
  }, [exportData, exportFormat, exportConversationId]);

  const handleExportConversation = useCallback(
    (format: "json" | "md") => {
      if (exportingFormat) {
        return;
      }

      const conversationId = actionConversationId;
      if (!conversationId) {
        return;
      }

      setExportingFormat(format);
      setExportFormat(format);
      setExportConversationId(conversationId);
      handleClose();
    },
    [exportingFormat, actionConversationId, handleClose]
  );

  const handleNewConversation = useCallback(() => {
    navigate("/");
    handleClose();
  }, [navigate, handleClose]);

  const handleToggleTheme = useCallback(() => {
    toggleTheme();
    handleClose();
  }, [toggleTheme, handleClose]);

  const handleImportConversations = useCallback(() => {
    handleClose();
    // Trigger file picker after palette closes
    setTimeout(() => conversationImport.triggerFileInput(), 200);
  }, [handleClose, conversationImport]);

  const handlePrivateMode = useCallback(() => {
    navigate("/private");
    handleClose();
  }, [navigate, handleClose]);

  const handleNavigateToSettings = useCallback(
    (path: string) => {
      navigate(path);
      handleClose();
    },
    [navigate, handleClose]
  );

  useEffect(() => {
    if (open) {
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
    setSearch("");
    setSelectedValue("");
    setNavigation({ currentMenu: "main" });
    resetCommandState();
  }, [open, resetCommandState]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        if (navigation.currentMenu !== "main") {
          navigateBack();
        } else {
          handleClose();
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-command-palette]")) {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, navigation.currentMenu, navigateBack, handleClose]);

  const normalizedDebouncedSearch = debouncedSearch.trim().toLowerCase();
  const normalizedDeferredSearch = deferredSearch.trim().toLowerCase();
  const hasSearchQuery = normalizedDeferredSearch.length > 0;
  const hasRemoteSearchQuery = normalizedDebouncedSearch.length > 0;
  const showSearchResults = hasRemoteSearchQuery && Boolean(searchResults);
  const isSearching = search.trim().length > 0 && search !== debouncedSearch;

  const settingsActions = useMemo((): Action[] => {
    // Settings are only available to authenticated users
    if (!isAuthenticated) {
      return [];
    }

    return [
      {
        id: "settings-general",
        label: "General",
        icon: GearIcon,
        handler: () => handleNavigateToSettings(ROUTES.SETTINGS.GENERAL),
        disabled: !online,
      },
      {
        id: "settings-api-keys",
        label: "API Keys",
        icon: KeyIcon,
        handler: () => handleNavigateToSettings(ROUTES.SETTINGS.API_KEYS),
        disabled: !online,
      },
      {
        id: "settings-models",
        label: "Models",
        icon: RobotIcon,
        handler: () => handleNavigateToSettings(ROUTES.SETTINGS.MODELS),
        disabled: !online,
      },
      {
        id: "settings-personas",
        label: "Personas",
        icon: UsersIcon,
        handler: () => handleNavigateToSettings(ROUTES.SETTINGS.PERSONAS),
        disabled: !online,
      },
      {
        id: "settings-shares",
        label: "Shares",
        icon: ShareNetworkIcon,
        handler: () =>
          handleNavigateToSettings(ROUTES.SETTINGS.SHARED_CONVERSATIONS),
        disabled: !online,
      },
      {
        id: "settings-archive",
        label: "Archive",
        icon: ArchiveIcon,
        handler: () =>
          handleNavigateToSettings(ROUTES.SETTINGS.ARCHIVED_CONVERSATIONS),
        disabled: !online,
      },
      {
        id: "settings-chat-history",
        label: "Chat History",
        icon: CloudArrowDownIcon,
        handler: () => handleNavigateToSettings(ROUTES.SETTINGS.CHAT_HISTORY),
        disabled: !online,
      },
      {
        id: "settings-attachments",
        label: "Attachments",
        icon: PaperclipIcon,
        handler: () => handleNavigateToSettings(ROUTES.SETTINGS.ATTACHMENTS),
        disabled: !online,
      },
    ];
  }, [handleNavigateToSettings, online, isAuthenticated]);

  const globalActions = useMemo((): Action[] => {
    const actions: Action[] = [
      {
        id: "new-conversation",
        label: "New Conversation",
        icon: PlusIcon,
        handler: handleNewConversation,
        disabled: false,
      },
      {
        id: "private-mode",
        label: "Private Mode",
        icon: EyeSlashIcon,
        handler: handlePrivateMode,
        disabled: false,
      },
    ];

    // Browse and import actions require authentication
    if (isAuthenticated) {
      actions.push(
        {
          id: "browse-conversations",
          label: "Browse All Conversations",
          icon: ChatCircleIcon,
          handler: () =>
            navigateToMenu(
              "conversation-browser",
              undefined,
              "All Conversations"
            ),
          disabled: !online,
        },
        {
          id: "browse-models",
          label: "Browse All Models",
          icon: MagnifyingGlassIcon,
          handler: () =>
            navigateToMenu("model-categories", undefined, "All Models"),
          disabled: !online,
        },
        {
          id: "import-conversations",
          label: "Import Conversations",
          icon: UploadIcon,
          handler: handleImportConversations,
          disabled: !online,
        }
      );
    }

    actions.push({
      id: "toggle-theme",
      label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
      icon: theme === "dark" ? SunIcon : MoonIcon,
      handler: handleToggleTheme,
      disabled: false,
    });

    return actions;
  }, [
    theme,
    handleNewConversation,
    handlePrivateMode,
    handleImportConversations,
    handleToggleTheme,
    navigateToMenu,
    online,
    isAuthenticated,
  ]);

  const conversationActions = useMemo(() => {
    const actions: Action[] = [
      {
        id: "toggle-pin",
        label: currentConversation?.conversation?.isPinned ? "Unpin" : "Pin",
        icon: PushPinIcon,
        handler: handleToggleFavorite,
        disabled: !online,
      },
      {
        id: "edit-title",
        label: "Edit title",
        icon: PencilSimpleIcon,
        handler: handleRenameConversation,
        disabled: !online,
      },
    ];

    // Share and archive require authentication (archive needs settings access to unarchive)
    if (isAuthenticated) {
      actions.push({
        id: "share-conversation",
        label: "Share",
        icon: ShareNetworkIcon,
        handler: handleShareConversation,
        disabled: !online,
      });
    }

    actions.push(
      {
        id: "export-markdown",
        label: "Export as Markdown",
        icon: FileTextIcon,
        handler: () => handleExportConversation("md"),
        disabled: !online,
      },
      {
        id: "export-json",
        label: "Export as JSON",
        icon: FileCodeIcon,
        handler: () => handleExportConversation("json"),
        disabled: !online,
      }
    );

    if (isAuthenticated) {
      actions.push({
        id: "archive-conversation",
        label: "Archive",
        icon: ArchiveIcon,
        handler: handleToggleArchive,
        disabled: !online,
      });
    }

    actions.push({
      id: "delete-conversation",
      label: "Delete",
      icon: TrashIcon,
      handler: handleDeleteConversation,
      disabled: !online,
    });

    return actions;
  }, [
    currentConversation?.conversation?.isPinned,
    handleToggleFavorite,
    handleRenameConversation,
    handleShareConversation,
    handleExportConversation,
    handleToggleArchive,
    handleDeleteConversation,
    online,
    isAuthenticated,
  ]);

  const filteredGlobalActions = useMemo(() => {
    if (!hasSearchQuery) {
      return globalActions;
    }
    return globalActions.filter(action =>
      action.label.toLowerCase().includes(normalizedDeferredSearch)
    );
  }, [hasSearchQuery, normalizedDeferredSearch, globalActions]);

  const filteredConversationActions = useMemo(() => {
    if (!hasSearchQuery) {
      return conversationActions;
    }
    return conversationActions.filter(action =>
      action.label.toLowerCase().includes(normalizedDeferredSearch)
    );
  }, [hasSearchQuery, normalizedDeferredSearch, conversationActions]);

  const filteredSettingsActions = useMemo(() => {
    if (!hasSearchQuery) {
      return settingsActions;
    }
    return settingsActions.filter(action =>
      action.label.toLowerCase().includes(normalizedDeferredSearch)
    );
  }, [hasSearchQuery, normalizedDeferredSearch, settingsActions]);

  const recentConversationsList = useMemo(() => {
    if (Array.isArray(recentConversations)) {
      return recentConversations as ConversationType[];
    }
    return (recentConversations?.page ?? []) as ConversationType[];
  }, [recentConversations]);

  const searchResultsList = useMemo(() => {
    if (!searchResults) {
      return [] as ConversationType[];
    }
    return searchResults as ConversationType[];
  }, [searchResults]);

  const conversationsToShow = useMemo(() => {
    if (showSearchResults) {
      return searchResultsList.slice(0, 10);
    }
    return recentConversationsList.slice(0, 6);
  }, [showSearchResults, searchResultsList, recentConversationsList]);

  const filterModels = useCallback((models: ModelType[], query: string) => {
    const searchLower = query.toLowerCase();
    return models.filter(model => {
      const nameLower = model.name.toLowerCase();
      const modelIdLower = model.modelId.toLowerCase();
      const providerLower = model.provider.toLowerCase();

      return (
        nameLower.includes(searchLower) ||
        modelIdLower.includes(searchLower) ||
        providerLower.includes(searchLower) ||
        nameLower.split(" ").some(word => word.includes(searchLower)) ||
        modelIdLower.split("-").some(word => word.includes(searchLower))
      );
    });
  }, []);

  const modelsToShow = useMemo(() => {
    if (navigation.currentMenu === "model-categories") {
      return hasSearchQuery
        ? filterModels(allModels, normalizedDeferredSearch)
        : allModels;
    }

    if (hasSearchQuery) {
      return filterModels(allModels, normalizedDeferredSearch).slice(0, 8);
    }

    if (recentlyUsedModels && recentlyUsedModels.length > 0) {
      return recentlyUsedModels.slice(0, 6);
    }

    return allModels.slice(0, 6);
  }, [
    navigation.currentMenu,
    hasSearchQuery,
    normalizedDeferredSearch,
    allModels,
    recentlyUsedModels,
    filterModels,
  ]);

  // Group models by provider for the model categories menu
  const modelsByProvider = useMemo(() => {
    if (navigation.currentMenu !== "model-categories") {
      return {};
    }

    const grouped: Record<string, ModelType[]> = {};
    modelsToShow.forEach(model => {
      const provider = model?.provider;
      if (!provider) {
        return;
      }
      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      grouped[provider]?.push(model as ModelType);
    });

    // Sort providers alphabetically and sort models within each provider
    const sortedGroups: Record<string, ModelType[]> = {};
    Object.keys(grouped)
      .sort()
      .forEach(provider => {
        const modelsForProvider = grouped[provider] ?? [];
        sortedGroups[provider] = [...modelsForProvider].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });

    return sortedGroups;
  }, [navigation.currentMenu, modelsToShow]);

  const allConversationsList = useMemo(() => {
    if (Array.isArray(allConversations)) {
      return allConversations as ConversationType[];
    }
    return (allConversations?.page ?? []) as ConversationType[];
  }, [allConversations]);

  const conversationsByCategory = useMemo(() => {
    if (navigation.currentMenu !== "conversation-browser") {
      return {};
    }

    const conversations = allConversationsList;

    if (!conversations.length) {
      return {};
    }

    const filteredConversations = hasSearchQuery
      ? conversations.filter(conv =>
          conv.title?.toLowerCase().includes(normalizedDeferredSearch)
        )
      : conversations;

    const sortByCreationTime = (a: ConversationType, b: ConversationType) =>
      new Date(b._creationTime).getTime() - new Date(a._creationTime).getTime();

    const categories: Record<string, ConversationType[]> = {};

    const pinned = filteredConversations.filter(
      conv => conv.isPinned && !conv.isArchived
    );
    const archived = filteredConversations.filter(conv => conv.isArchived);
    const recent = filteredConversations.filter(
      conv => !(conv.isPinned || conv.isArchived)
    );

    if (pinned.length > 0) {
      categories["Pinned"] = pinned.sort(sortByCreationTime);
    }
    if (recent.length > 0) {
      categories["Recent"] = recent.sort(sortByCreationTime);
    }
    if (archived.length > 0) {
      categories["Archived"] = archived.sort(sortByCreationTime);
    }

    return categories;
  }, [
    navigation.currentMenu,
    allConversationsList,
    hasSearchQuery,
    normalizedDeferredSearch,
  ]);

  // Simple array operation - React Compiler will optimize if needed
  const conversationBrowserList = Object.values(conversationsByCategory).flat();

  const getConversationById = useCallback(
    (conversationId: string) => {
      const fromRecent = conversationsToShow.find(
        conversation => conversation._id === conversationId
      );
      if (fromRecent) {
        return fromRecent;
      }

      return conversationBrowserList.find(
        conversation => conversation._id === conversationId
      );
    },
    [conversationsToShow, conversationBrowserList]
  );

  const handleRootKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!open) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (
        event.key === "ArrowLeft" &&
        navigation.currentMenu !== "main" &&
        !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
      ) {
        if (target?.tagName === "INPUT") {
          const input = target as HTMLInputElement;
          const atStart =
            input.selectionStart === 0 && input.selectionEnd === 0;
          if (!atStart || input.value.length > 0) {
            return;
          }
        }

        event.preventDefault();
        navigateBack();
        return;
      }

      const isConversationSelected =
        navigation.currentMenu !== "conversation-actions" &&
        selectedValue?.startsWith("conversation-");

      if (isConversationSelected) {
        const conversationId = selectedValue.replace("conversation-", "");
        const conversation = getConversationById(conversationId);
        if (!conversation) {
          return;
        }

        if (
          event.key === "ArrowRight" &&
          !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
        ) {
          if (target?.tagName === "INPUT") {
            const input = target as HTMLInputElement;
            const atEnd =
              input.selectionStart === input.value.length &&
              input.selectionEnd === input.value.length;
            if (!atEnd) {
              return;
            }
          }

          if (target?.tagName !== "INPUT") {
            event.preventDefault();
          }
          handleConversationActions(conversation._id, conversation.title);
        }
      }
    },
    [
      open,
      navigation.currentMenu,
      navigateBack,
      selectedValue,
      getConversationById,
      handleConversationActions,
    ]
  );

  type FooterHint = {
    key: string;
    label: string;
    desktopOnly?: boolean;
  };

  const footerHints = useMemo(() => {
    const hints: FooterHint[] = [];
    const escLabel = navigation.currentMenu !== "main" ? "Back" : "Close";
    const addEscHint = () => hints.push({ key: "Esc", label: escLabel });

    if (!selectedValue) {
      hints.push({ key: "Enter", label: "Select" });
      addEscHint();
      return hints;
    }

    if (selectedValue === "back") {
      hints.push({ key: "Enter", label: "Navigate" });
      addEscHint();
      return hints;
    }

    if (selectedValue.startsWith("conversation-")) {
      hints.push({ key: "Enter", label: "Navigate" });
      hints.push({ key: "→", label: "Actions", desktopOnly: true });
      addEscHint();
      return hints;
    }

    if (selectedValue.startsWith("model-")) {
      hints.push({ key: "Enter", label: "Select" });
      addEscHint();
      return hints;
    }

    const conversationAction = conversationActions.find(
      action => action.id === selectedValue
    );
    if (conversationAction) {
      hints.push({ key: "Enter", label: "Select" });
      addEscHint();
      return hints;
    }

    const globalAction = globalActions.find(
      action => action.id === selectedValue
    );
    if (globalAction) {
      hints.push({ key: "Enter", label: "Select" });
      addEscHint();
      return hints;
    }

    const settingsAction = settingsActions.find(
      action => action.id === selectedValue
    );
    if (settingsAction) {
      hints.push({ key: "Enter", label: "Navigate" });
      addEscHint();
      return hints;
    }

    hints.push({ key: "Enter", label: "Select" });
    addEscHint();
    return hints;
  }, [
    selectedValue,
    navigation.currentMenu,
    conversationActions,
    globalActions,
    settingsActions,
  ]);

  const [hasBeenOpened, setHasBeenOpened] = useState(false);

  useEffect(() => {
    if (open) {
      setHasBeenOpened(true);
    }
  }, [open]);

  if (!hasBeenOpened) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <Backdrop
        className={`z-command-palette ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        data-state={open ? "open" : "closed"}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Command Palette Container */}
      <div
        className={`fixed left-1/2 top-[15%] z-command-palette w-full max-w-2xl -translate-x-1/2 px-4 transition-all duration-200 ease-out ${
          open
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
        }`}
      >
        <Command
          className="mx-auto w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl [&_[cmdk-input-wrapper]]:border-0"
          data-command-palette
          shouldFilter={false}
          value={selectedValue}
          onValueChange={setSelectedValue}
          onKeyDown={handleRootKeyDown}
          loop
          vimBindings={false}
        >
          <div className="border-b border-border/10 relative">
            {navigation.currentMenu !== "main" && (
              <div className="flex items-center px-4 py-2 border-b border-border/50 bg-muted/30">
                <CommandItem
                  value="back"
                  onSelect={navigateBack}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer -mx-2 px-2"
                >
                  <ArrowLeftIcon className="size-4" />
                  <span>Back</span>
                </CommandItem>
                {navigation.breadcrumb && (
                  <span className="ml-4 text-sm font-medium text-foreground">
                    {navigation.breadcrumb}
                  </span>
                )}
              </div>
            )}
            <CommandInput
              ref={inputRef}
              className="h-14 border-0 bg-transparent text-base focus:ring-0 [&_.cmdk-input]:h-14"
              placeholder={getCommandInputPlaceholder(navigation.currentMenu)}
              value={search}
              onValueChange={setSearch}
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Spinner size="sm" className="size-4" />
              </div>
            )}
          </div>
          <CommandList
            ref={commandListRef}
            className="max-h-[400px] overflow-y-auto py-3 pb-16"
          >
            {/* Only show empty state if data is loaded (to prevent flash while loading) */}
            {modelsLoaded &&
              recentConversations !== undefined &&
              (navigation.currentMenu !== "conversation-browser" ||
                allConversations !== undefined) &&
              (navigation.currentMenu !== "main" ||
                !hasSearchQuery ||
                searchResults !== undefined) && (
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-2 py-6">
                    <MagnifyingGlassIcon className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No results found
                    </p>
                  </div>
                </CommandEmpty>
              )}

            {/* Main Menu */}
            {navigation.currentMenu === "main" && (
              <CommandPaletteMainMenu
                isConversationPage={isConversationPage}
                hasCurrentConversation={!!currentConversation?.conversation}
                isPinned={currentConversation?.conversation?.isPinned}
                filteredConversationActions={filteredConversationActions}
                filteredGlobalActions={filteredGlobalActions}
                filteredSettingsActions={filteredSettingsActions}
                conversationsToShow={conversationsToShow}
                modelsToShow={modelsToShow}
                modelsLoaded={modelsLoaded}
                hasSearchQuery={hasSearchQuery}
                exportingFormat={exportingFormat}
                currentSelectedModel={currentSelectedModel}
                online={online}
                onNavigateToConversation={handleNavigateToConversation}
                onConversationActions={handleConversationActions}
                onSelectModel={handleSelectModel}
              />
            )}

            {/* Conversation Actions Menu */}
            {navigation.currentMenu === "conversation-actions" && (
              <CommandPaletteConversationActions
                filteredConversationActions={filteredConversationActions}
                exportingFormat={exportingFormat}
                targetConversationIsPinned={
                  actionConversation?.conversation?.isPinned
                }
              />
            )}

            {/* Model Categories Menu */}
            {navigation.currentMenu === "model-categories" && modelsLoaded && (
              <CommandPaletteModelBrowser
                modelsByProvider={modelsByProvider}
                currentSelectedModel={currentSelectedModel}
                onSelectModel={handleSelectModel}
              />
            )}

            {/* Conversation Browser Menu */}
            {navigation.currentMenu === "conversation-browser" && (
              <CommandPaletteConversationBrowser
                conversationsByCategory={conversationsByCategory}
                allConversationsLoaded={allConversations !== undefined}
                online={online}
                onNavigateToConversation={handleNavigateToConversation}
                onConversationActions={handleConversationActions}
              />
            )}
          </CommandList>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-card/95 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground/80">
            <div className="flex flex-wrap items-center gap-3">
              {footerHints.map(hint => (
                <span
                  key={`${hint.key}-${hint.label}`}
                  className={`flex items-center gap-1 ${hint.desktopOnly ? "hidden md:flex" : ""}`}
                >
                  <kbd className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-overline font-medium">
                    {hint.key}
                  </kbd>
                  {hint.label}
                </span>
              ))}
            </div>
          </div>
        </Command>
      </div>

      {/* Share Dialog */}
      {currentConversation?.resolvedId && (
        <ControlledShareConversationDialog
          conversationId={currentConversation.resolvedId}
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={open => {
          setDeleteConfirmOpen(open);
          if (!open) {
            // Refocus command palette when dialog is dismissed
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);
          }
        }}
        title="Delete Conversation"
        description={`Are you sure you want to delete "${
          (navigation.selectedConversationId
            ? actionConversation
            : currentConversation
          )?.conversation?.title || "this conversation"
        }"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={confirmDeleteConversation}
      />

      {/* Import file input + confirmation dialog */}
      <input
        ref={conversationImport.fileInputRef}
        type="file"
        accept=".json,.md,.markdown"
        onChange={conversationImport.handleFileChange}
        className="hidden"
      />
      <ConfirmationDialog
        open={conversationImport.confirmDialog.state.isOpen}
        onOpenChange={conversationImport.confirmDialog.handleOpenChange}
        title={conversationImport.confirmDialog.state.title}
        description={conversationImport.confirmDialog.state.description}
        confirmText={conversationImport.confirmDialog.state.confirmText}
        cancelText={conversationImport.confirmDialog.state.cancelText}
        variant={conversationImport.confirmDialog.state.variant}
        onConfirm={conversationImport.confirmDialog.handleConfirm}
        onCancel={conversationImport.confirmDialog.handleCancel}
      />

      {/* Rename Dialog */}
      <TextInputDialog
        open={renameDialogOpen}
        onOpenChange={open => {
          setRenameDialogOpen(open);
          if (!open) {
            // Refocus command palette when dialog is dismissed
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);
          }
        }}
        title="Rename Conversation"
        label="Conversation title"
        placeholder="Enter conversation title"
        defaultValue={
          (navigation.selectedConversationId
            ? actionConversation
            : currentConversation
          )?.conversation?.title || ""
        }
        confirmText="Rename"
        cancelText="Cancel"
        onConfirm={confirmRenameConversation}
      />
    </>
  );
}
