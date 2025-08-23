import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChatCircleIcon,
  EyeSlashIcon,
  FileCodeIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PencilSimpleIcon,
  PlusIcon,
  PushPinIcon,
  ShareNetworkIcon,
  SunIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ProviderIcon } from "@/components/provider-icons";
import { Spinner } from "@/components/spinner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ControlledShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import { TextInputDialog } from "@/components/ui/text-input-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { useTheme } from "@/hooks/use-theme";
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "@/lib/export";
import { getModelCapabilities } from "@/lib/model-capabilities";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
};

type NavigationState = {
  currentMenu:
    | "main"
    | "conversation-actions"
    | "model-categories"
    | "conversation-browser";
  selectedConversationId?: string;
  breadcrumb?: string;
};

type ConversationType = {
  _id: string;
  title: string;
  isPinned: boolean;
  isArchived: boolean;
  _creationTime: number;
};

type ModelType = {
  modelId: string;
  provider: string;
  name: string;
  contextLength?: number;
  supportsReasoning?: boolean;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsFiles?: boolean;
  inputModalities?: string[];
};

export function CommandPalette({
  open,
  onOpenChange,
  onClose,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [navigation, setNavigation] = useState<NavigationState>({
    currentMenu: "main",
  });

  const debouncedSearch = useDebounce(search, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { theme, toggleTheme } = useTheme();

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

  const userModels = useQuery(api.userModels.getUserModels, {});
  const builtInModels = useQuery(api.userModels.getBuiltInModels, {});
  const modelsLoaded = userModels !== undefined && builtInModels !== undefined;
  const currentSelectedModel = useQuery(
    api.userModels.getUserSelectedModel,
    {}
  );
  const recentlyUsedModels = useQuery(api.userModels.getRecentlyUsedModels, {
    limit: 8,
  });

  const selectModelMutation = useMutation(api.userModels.selectModel);
  const patchConversation = useMutation(api.conversations.patch);
  const deleteConversation = useMutation(api.conversations.remove);

  const currentConversation = useQuery(
    api.conversations.getWithAccessInfo,
    currentConversationId
      ? { id: currentConversationId as Id<"conversations"> }
      : "skip"
  );

  const allModels = useMemo(() => {
    const modelMap = new Map<string, ModelType>();

    (builtInModels || []).forEach(model => {
      const key = `${model.provider}-${model.modelId}`;
      modelMap.set(key, model);
    });

    (userModels || []).forEach(model => {
      const key = `${model.provider}-${model.modelId}`;
      modelMap.set(key, model);
    });

    return Array.from(modelMap.values());
  }, [userModels, builtInModels]);

  const handleSelectModel = useCallback(
    async (modelId: string, provider: string) => {
      try {
        await selectModelMutation({ modelId, provider });
        handleClose();
      } catch (error) {
        console.error("Failed to select model:", error);
      }
    },
    [selectModelMutation, handleClose]
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

  const getActionConversationId = useCallback(() => {
    return navigation.selectedConversationId || currentConversationId;
  }, [navigation.selectedConversationId, currentConversationId]);

  const actionConversation = useQuery(
    api.conversations.getWithAccessInfo,
    getActionConversationId()
      ? { id: getActionConversationId() as Id<"conversations"> }
      : "skip"
  );

  const handleToggleFavorite = useCallback(async () => {
    const conversationId = getActionConversationId();
    const conversation = navigation.selectedConversationId
      ? actionConversation
      : currentConversation;

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
    getActionConversationId,
    navigation.selectedConversationId,
    navigation.currentMenu,
    actionConversation,
    currentConversation,
    patchConversation,
    navigateBack,
    handleClose,
  ]);

  const confirmToggleArchive = useCallback(async () => {
    const conversationId = getActionConversationId();
    const conversation = navigation.selectedConversationId
      ? actionConversation
      : currentConversation;

    if (!(conversationId && conversation?.conversation)) {
      return;
    }

    try {
      await patchConversation({
        id: conversationId as Id<"conversations">,
        updates: { isArchived: !conversation.conversation.isArchived },
      });

      if (
        !conversation.conversation.isArchived &&
        conversationId === currentConversationId
      ) {
        navigate("/");
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
    getActionConversationId,
    navigation.selectedConversationId,
    navigation.currentMenu,
    actionConversation,
    currentConversation,
    currentConversationId,
    patchConversation,
    navigate,
    navigateBack,
    handleClose,
  ]);

  const handleToggleArchive = useCallback(() => {
    const conversation = navigation.selectedConversationId
      ? actionConversation
      : currentConversation;

    if (conversation?.conversation && !conversation.conversation.isArchived) {
      setArchiveConfirmOpen(true);
    } else {
      confirmToggleArchive();
    }
  }, [
    navigation.selectedConversationId,
    actionConversation,
    currentConversation,
    confirmToggleArchive,
  ]);

  const handleShareConversation = useCallback(() => {
    setIsShareDialogOpen(true);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleDeleteConversation = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDeleteConversation = useCallback(async () => {
    const conversationId = getActionConversationId();
    const conversation = navigation.selectedConversationId
      ? actionConversation
      : currentConversation;

    if (!(conversationId && conversation?.conversation)) {
      return;
    }

    try {
      await deleteConversation({ id: conversationId as Id<"conversations"> });

      if (conversationId === currentConversationId) {
        navigate("/");
      }

      if (navigation.currentMenu === "conversation-actions") {
        navigateBack();
      } else {
        handleClose();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  }, [
    getActionConversationId,
    navigation.selectedConversationId,
    navigation.currentMenu,
    actionConversation,
    currentConversation,
    currentConversationId,
    deleteConversation,
    navigate,
    navigateBack,
    handleClose,
  ]);

  const handleRenameConversation = useCallback(() => {
    setRenameDialogOpen(true);
  }, []);

  const confirmRenameConversation = useCallback(
    async (newTitle: string) => {
      const conversationId = getActionConversationId();
      const conversation = navigation.selectedConversationId
        ? actionConversation
        : currentConversation;

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
      getActionConversationId,
      navigation.selectedConversationId,
      navigation.currentMenu,
      actionConversation,
      currentConversation,
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

      const conversationId = getActionConversationId();
      if (!conversationId) {
        return;
      }

      setExportingFormat(format);
      setExportFormat(format);
      setExportConversationId(conversationId);
      handleClose();
    },
    [exportingFormat, getActionConversationId, handleClose]
  );

  const handleNewConversation = useCallback(() => {
    navigate("/");
    handleClose();
  }, [navigate, handleClose]);

  const handleToggleTheme = useCallback(() => {
    toggleTheme();
    handleClose();
  }, [toggleTheme, handleClose]);

  const handlePrivateMode = useCallback(() => {
    navigate("/private");
    handleClose();
  }, [navigate, handleClose]);

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

  const hasSearchQuery = debouncedSearch.trim().length > 0;
  const showSearchResults = hasSearchQuery && searchResults;
  const isSearching = search.trim().length > 0 && search !== debouncedSearch;

  const globalActions = useMemo(
    () => [
      {
        id: "new-conversation",
        label: "New Conversation",
        icon: PlusIcon,
        handler: handleNewConversation,
      },
      {
        id: "private-mode",
        label: "Private Mode",
        icon: EyeSlashIcon,
        handler: handlePrivateMode,
      },
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
      },
      {
        id: "browse-models",
        label: "Browse All Models",
        icon: MagnifyingGlassIcon,
        handler: () =>
          navigateToMenu("model-categories", undefined, "All Models"),
      },
      {
        id: "toggle-theme",
        label:
          theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        icon: theme === "dark" ? SunIcon : MoonIcon,
        handler: handleToggleTheme,
      },
    ],
    [
      theme,
      handleNewConversation,
      handlePrivateMode,
      handleToggleTheme,
      navigateToMenu,
    ]
  );

  const conversationActions = useMemo(
    () => [
      {
        id: "toggle-pin",
        label: currentConversation?.conversation?.isPinned ? "Unpin" : "Pin",
        icon: PushPinIcon,
        handler: handleToggleFavorite,
      },
      {
        id: "edit-title",
        label: "Edit title",
        icon: PencilSimpleIcon,
        handler: handleRenameConversation,
      },
      {
        id: "share-conversation",
        label: "Share",
        icon: ShareNetworkIcon,
        handler: handleShareConversation,
      },
      {
        id: "export-markdown",
        label: "Export as Markdown",
        icon: FileTextIcon,
        handler: () => handleExportConversation("md"),
      },
      {
        id: "export-json",
        label: "Export as JSON",
        icon: FileCodeIcon,
        handler: () => handleExportConversation("json"),
      },
      {
        id: "archive-conversation",
        label: "Archive",
        icon: ArchiveIcon,
        handler: handleToggleArchive,
      },
      {
        id: "delete-conversation",
        label: "Delete",
        icon: TrashIcon,
        handler: handleDeleteConversation,
      },
    ],
    [
      currentConversation?.conversation?.isPinned,
      handleToggleFavorite,
      handleRenameConversation,
      handleShareConversation,
      handleExportConversation,
      handleToggleArchive,
      handleDeleteConversation,
    ]
  );

  const filteredGlobalActions = useMemo(() => {
    if (!hasSearchQuery) {
      return globalActions;
    }
    const query = debouncedSearch.toLowerCase();
    return globalActions.filter(action =>
      action.label.toLowerCase().includes(query)
    );
  }, [hasSearchQuery, debouncedSearch, globalActions]);

  const filteredConversationActions = useMemo(() => {
    if (!hasSearchQuery) {
      return conversationActions;
    }
    const query = debouncedSearch.toLowerCase();
    return conversationActions.filter(action =>
      action.label.toLowerCase().includes(query)
    );
  }, [hasSearchQuery, debouncedSearch, conversationActions]);

  const conversationsToShow = useMemo(() => {
    if (showSearchResults) {
      return searchResults?.slice(0, 10);
    }
    if (Array.isArray(recentConversations)) {
      return recentConversations.slice(0, 6);
    }
    return recentConversations?.page?.slice(0, 6) || [];
  }, [showSearchResults, searchResults, recentConversations]);

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
        ? filterModels(allModels, debouncedSearch)
        : allModels;
    }

    if (hasSearchQuery) {
      return filterModels(allModels, debouncedSearch).slice(0, 8);
    }

    if (recentlyUsedModels && recentlyUsedModels.length > 0) {
      return recentlyUsedModels.slice(0, 6);
    }

    return allModels.slice(0, 6);
  }, [
    navigation.currentMenu,
    hasSearchQuery,
    debouncedSearch,
    allModels,
    recentlyUsedModels,
    filterModels,
  ]);

  // Group models by provider for the model categories menu
  const modelsByProvider = useMemo(() => {
    if (navigation.currentMenu !== "model-categories") {
      return {};
    }

    const grouped: Record<string, typeof modelsToShow> = {};
    modelsToShow.forEach(model => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    });

    // Sort providers alphabetically and sort models within each provider
    const sortedGroups: Record<string, typeof modelsToShow> = {};
    Object.keys(grouped)
      .sort()
      .forEach(provider => {
        sortedGroups[provider] = grouped[provider].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });

    return sortedGroups;
  }, [navigation.currentMenu, modelsToShow]);

  const conversationsByCategory = useMemo(() => {
    if (navigation.currentMenu !== "conversation-browser") {
      return {};
    }

    const conversations = (
      Array.isArray(allConversations)
        ? allConversations
        : allConversations?.page || []
    ) as ConversationType[];

    if (!conversations.length) {
      return {};
    }

    const filteredConversations = hasSearchQuery
      ? conversations.filter(conv =>
          conv.title?.toLowerCase().includes(debouncedSearch.toLowerCase())
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
    allConversations,
    hasSearchQuery,
    debouncedSearch,
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
      {/* Command Palette Container */}
      <div
        className={`fixed left-1/2 top-[15%] z-50 w-full max-w-2xl -translate-x-1/2 px-4 transition-all duration-200 ease-out ${
          open
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <Command
          className="mx-auto w-full overflow-hidden rounded-lg bg-background dark:bg-card shadow-2xl border border-border drop-shadow-2xl"
          data-command-palette
          shouldFilter={false}
          value={selectedValue}
          onValueChange={setSelectedValue}
          loop
          vimBindings={false}
        >
          <div className="border-b border-border/20 relative">
            {navigation.currentMenu !== "main" && (
              <div className="flex items-center px-4 py-2 border-b border-border/10">
                <CommandItem
                  value="back"
                  onSelect={navigateBack}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer -mx-2 px-2"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
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
              placeholder={
                navigation.currentMenu === "conversation-actions"
                  ? "Search actions..."
                  : navigation.currentMenu === "model-categories"
                    ? "Search models..."
                    : navigation.currentMenu === "conversation-browser"
                      ? "Search conversations..."
                      : "Search conversations, switch models, or take actions..."
              }
              value={search}
              onValueChange={setSearch}
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Spinner size="sm" className="h-4 w-4" />
              </div>
            )}
          </div>
          <CommandList
            ref={commandListRef}
            className="max-h-[400px] overflow-y-auto py-3"
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
                    <MagnifyingGlassIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No results found
                    </p>
                  </div>
                </CommandEmpty>
              )}

            {/* Main Menu */}
            {navigation.currentMenu === "main" && (
              <>
                {/* Conversation-specific actions - Show first when on conversation page */}
                {isConversationPage &&
                  currentConversation?.conversation &&
                  filteredConversationActions.length > 0 && (
                    <CommandGroup
                      heading="Conversation"
                      className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
                    >
                      {filteredConversationActions.map(action => {
                        const IconComponent = action.icon;
                        const isExportAction = action.id.startsWith("export-");
                        const isDeleteAction =
                          action.id === "delete-conversation";
                        const isPinAction = action.id === "toggle-pin";

                        return (
                          <CommandItem
                            key={action.id}
                            value={action.id}
                            onSelect={action.handler}
                            className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                            disabled={
                              isExportAction &&
                              exportingFormat === action.id.split("-")[1]
                            }
                          >
                            <IconComponent
                              className={`h-4 w-4 flex-shrink-0 ${isDeleteAction ? "text-red-500" : "text-muted-foreground"}`}
                              weight={
                                isPinAction &&
                                currentConversation?.conversation?.isPinned
                                  ? "fill"
                                  : "regular"
                              }
                            />
                            <span
                              className={`flex-1 ${isDeleteAction ? "text-red-500" : ""}`}
                            >
                              {isExportAction &&
                              exportingFormat === action.id.split("-")[1]
                                ? "Exporting..."
                                : action.label}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}

                {/* Global actions - Show after conversation actions */}
                {filteredGlobalActions.length > 0 && (
                  <>
                    {isConversationPage &&
                      currentConversation?.conversation &&
                      filteredConversationActions.length > 0 && (
                        <CommandSeparator className="my-2" />
                      )}
                    <CommandGroup
                      heading="Actions"
                      className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
                    >
                      {filteredGlobalActions.map(action => {
                        const IconComponent = action.icon;

                        return (
                          <CommandItem
                            key={action.id}
                            value={action.id}
                            onSelect={action.handler}
                            className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                          >
                            <IconComponent className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <span className="flex-1">{action.label}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}

                {/* Conversations - Show after actions */}
                {conversationsToShow && conversationsToShow.length > 0 && (
                  <>
                    {(filteredGlobalActions.length > 0 ||
                      (isConversationPage &&
                        currentConversation?.conversation &&
                        filteredConversationActions.length > 0)) && (
                      <CommandSeparator className="my-2" />
                    )}
                    <CommandGroup
                      heading={
                        hasSearchQuery
                          ? "Conversations"
                          : "Recent Conversations"
                      }
                      className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
                    >
                      {conversationsToShow.map(
                        (conversation: ConversationType) => (
                          <CommandItem
                            key={conversation._id}
                            value={`conversation-${conversation._id}`}
                            onSelect={() => {
                              const event = window.event as KeyboardEvent;
                              if (event?.metaKey || event?.ctrlKey) {
                                handleConversationActions(
                                  conversation._id,
                                  conversation.title
                                );
                              } else {
                                handleNavigateToConversation(conversation._id);
                              }
                            }}
                            className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                          >
                            <ChatCircleIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">
                                {conversation.title}
                              </div>
                            </div>
                            {conversation.isPinned && (
                              <PushPinIcon
                                className="h-3 w-3 text-muted-foreground flex-shrink-0"
                                weight="fill"
                              />
                            )}
                          </CommandItem>
                        )
                      )}
                    </CommandGroup>
                  </>
                )}

                {/* Models - Only show when models are loaded */}
                {modelsLoaded && modelsToShow && modelsToShow.length > 0 && (
                  <>
                    {(filteredGlobalActions.length > 0 ||
                      (isConversationPage &&
                        currentConversation?.conversation &&
                        filteredConversationActions.length > 0) ||
                      conversationsToShow?.length > 0) && (
                      <CommandSeparator className="my-2" />
                    )}
                    <CommandGroup
                      heading={hasSearchQuery ? "Models" : "Switch Model"}
                      className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
                    >
                      {modelsToShow.map(model => {
                        const isSelected =
                          currentSelectedModel?.modelId === model.modelId &&
                          currentSelectedModel?.provider === model.provider;

                        const capabilities = getModelCapabilities(model);

                        return (
                          <CommandItem
                            key={`${model.provider}-${model.modelId}`}
                            value={`model-${model.provider}-${model.modelId}`}
                            onSelect={() =>
                              handleSelectModel(model.modelId, model.provider)
                            }
                            className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                          >
                            <ProviderIcon
                              provider={model.provider}
                              className="h-4 w-4 text-muted-foreground flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">
                                {model.name}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {capabilities.length > 0 &&
                                capabilities.map((capability, index) => {
                                  const IconComponent = capability.icon;
                                  return (
                                    <div
                                      key={`${model.modelId}-${capability.label}-${index}`}
                                      className="flex h-4 w-4 items-center justify-center rounded-sm bg-muted/50"
                                      title={capability.label}
                                    >
                                      <IconComponent className="h-2.5 w-2.5 text-muted-foreground" />
                                    </div>
                                  );
                                })}
                              {isSelected && (
                                <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0 ml-1" />
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}
              </>
            )}

            {/* Conversation Actions Menu */}
            {navigation.currentMenu === "conversation-actions" && (
              <CommandGroup
                heading="Actions"
                className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
              >
                {filteredConversationActions.map(action => {
                  const IconComponent = action.icon;
                  const isExportAction = action.id.startsWith("export-");
                  const isDeleteAction = action.id === "delete-conversation";
                  const isPinAction = action.id === "toggle-pin";
                  const targetConversation = actionConversation?.conversation;

                  return (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={action.handler}
                      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                      disabled={
                        isExportAction &&
                        exportingFormat === action.id.split("-")[1]
                      }
                    >
                      <IconComponent
                        className={`h-4 w-4 flex-shrink-0 ${isDeleteAction ? "text-red-500" : "text-muted-foreground"}`}
                        weight={
                          isPinAction && targetConversation?.isPinned
                            ? "fill"
                            : "regular"
                        }
                      />
                      <span
                        className={`flex-1 ${isDeleteAction ? "text-red-500" : ""}`}
                      >
                        {isExportAction &&
                        exportingFormat === action.id.split("-")[1]
                          ? "Exporting..."
                          : action.label}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Model Categories Menu - Only show when models are loaded */}
            {navigation.currentMenu === "model-categories" && modelsLoaded && (
              <>
                {Object.entries(modelsByProvider).map(
                  ([provider, models], providerIndex) => (
                    <div key={provider}>
                      {providerIndex > 0 && (
                        <CommandSeparator className="my-2" />
                      )}
                      <CommandGroup
                        heading={provider}
                        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
                      >
                        {models.map(model => {
                          const isSelected =
                            currentSelectedModel?.modelId === model.modelId &&
                            currentSelectedModel?.provider === model.provider;

                          const capabilities = getModelCapabilities(model);

                          return (
                            <CommandItem
                              key={`${model.provider}-${model.modelId}`}
                              value={`model-${model.provider}-${model.modelId}`}
                              onSelect={() =>
                                handleSelectModel(model.modelId, model.provider)
                              }
                              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                            >
                              <ProviderIcon
                                provider={model.provider}
                                className="h-4 w-4 text-muted-foreground flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="truncate font-medium">
                                  {model.name}
                                </div>
                                {model.contextLength && (
                                  <div className="text-xs text-muted-foreground">
                                    {model.contextLength.toLocaleString()}{" "}
                                    tokens
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {capabilities.length > 0 &&
                                  capabilities.map((capability, index) => {
                                    const IconComponent = capability.icon;
                                    return (
                                      <div
                                        key={`${model.modelId}-${capability.label}-${index}`}
                                        className="flex h-4 w-4 items-center justify-center rounded-sm bg-muted/50"
                                        title={capability.label}
                                      >
                                        <IconComponent className="h-2.5 w-2.5 text-muted-foreground" />
                                      </div>
                                    );
                                  })}
                                {isSelected && (
                                  <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0 ml-1" />
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </div>
                  )
                )}
                {Object.keys(modelsByProvider).length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <MagnifyingGlassIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No models found
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Conversation Browser Menu */}
            {navigation.currentMenu === "conversation-browser" && (
              <>
                {Object.entries(conversationsByCategory).map(
                  ([category, conversations], categoryIndex) => (
                    <div key={category}>
                      {categoryIndex > 0 && (
                        <CommandSeparator className="my-2" />
                      )}
                      <CommandGroup
                        heading={category}
                        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
                      >
                        {conversations.map((conversation: ConversationType) => (
                          <CommandItem
                            key={conversation._id}
                            value={`conversation-${conversation._id}`}
                            onSelect={() => {
                              const event = window.event as KeyboardEvent;
                              if (event?.metaKey || event?.ctrlKey) {
                                handleConversationActions(
                                  conversation._id,
                                  conversation.title
                                );
                              } else {
                                handleNavigateToConversation(conversation._id);
                              }
                            }}
                            className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
                          >
                            <ChatCircleIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium">
                                {conversation.title}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(
                                  conversation._creationTime
                                ).toLocaleDateString()}
                              </div>
                            </div>
                            {conversation.isPinned && (
                              <PushPinIcon
                                className="h-3 w-3 text-muted-foreground flex-shrink-0"
                                weight="fill"
                              />
                            )}
                            {conversation.isArchived && (
                              <ArchiveIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </div>
                  )
                )}
                {Object.keys(conversationsByCategory).length === 0 &&
                  allConversations !== undefined && (
                    <div className="flex flex-col items-center gap-2 py-6">
                      <ChatCircleIcon className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        No conversations found
                      </p>
                    </div>
                  )}
              </>
            )}
          </CommandList>
        </Command>
      </div>

      {/* Share Dialog */}
      {currentConversationId && (
        <ControlledShareConversationDialog
          conversationId={currentConversationId as Id<"conversations">}
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

      {/* Archive Confirmation Dialog */}
      <ConfirmationDialog
        open={archiveConfirmOpen}
        onOpenChange={open => {
          setArchiveConfirmOpen(open);
          if (!open) {
            // Refocus command palette when dialog is dismissed
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);
          }
        }}
        title="Archive Conversation"
        description={`Are you sure you want to archive "${
          (navigation.selectedConversationId
            ? actionConversation
            : currentConversation
          )?.conversation?.title || "this conversation"
        }"?`}
        confirmText="Archive"
        cancelText="Cancel"
        onConfirm={confirmToggleArchive}
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
