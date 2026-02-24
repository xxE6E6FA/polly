import { useAuth } from "@clerk/clerk-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  DownloadSimpleIcon,
  GithubLogoIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useConvex, useMutation } from "convex/react";
import { useCallback, useRef, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { ColorSchemeSelector } from "@/components/settings/color-scheme-selector";
import { ProfileDeleteDialog } from "@/components/settings/profile-delete-dialog";
import { ProfileFormDialog } from "@/components/settings/profile-form-dialog";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { UserIdCard } from "@/components/settings/user-id-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useProfiles } from "@/hooks/use-profiles";
import { useUserSettings } from "@/hooks/use-user-settings";
import { clearUserData } from "@/lib/local-storage";
import { getProfileIconComponent } from "@/lib/profile-icons";
import { useToast } from "@/providers/toast-context";
import type { Profile } from "@/types";

type DeleteTarget =
  | "conversations"
  | "memories"
  | "personas"
  | "all-data"
  | "account"
  | null;

const DELETE_CONFIGS: Record<
  NonNullable<DeleteTarget>,
  {
    title: string;
    description: string;
    confirmLabel: string;
    showExportHint?: boolean;
  }
> = {
  conversations: {
    title: "Delete all conversations?",
    description:
      "This will permanently remove all your conversations, messages, and attachments. This cannot be undone.",
    confirmLabel: "Delete all conversations",
  },
  memories: {
    title: "Delete all memories?",
    description:
      "This will permanently clear everything Polly has remembered about you. This cannot be undone.",
    confirmLabel: "Delete all memories",
  },
  personas: {
    title: "Delete all personas?",
    description:
      "This will permanently remove all custom personas, their settings, and reset built-in persona preferences. This cannot be undone.",
    confirmLabel: "Delete all personas",
  },
  "all-data": {
    title: "Delete all data?",
    description:
      "This will permanently erase all conversations, memories, personas, models, and API keys. Your account and settings will be kept. This cannot be undone.",
    confirmLabel: "Delete all data",
    showExportHint: true,
  },
  account: {
    title: "Delete your account?",
    description:
      "This will permanently delete your account and erase all associated data including conversations, models, and settings. This cannot be undone.",
    confirmLabel: "Delete account",
    showExportHint: true,
  },
};

type PaginatedResult<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string | null;
};

function isPaginatedResult<T>(value: unknown): value is PaginatedResult<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "page" in value &&
    Array.isArray((value as { page: unknown }).page)
  );
}

export default function GeneralPage() {
  const userSettings = useUserSettings();
  const updateUserSettings = useMutation(api.userSettings.updateUserSettings);
  const deleteAccountMutation = useMutation(api.users.deleteAccount);
  const clearAllMemories = useMutation(api.memory.clearAll);
  const clearAllPersonas = useMutation(api.personas.clearAll);
  const clearAllData = useMutation(api.users.clearAllData);
  const backgroundJobs = useBackgroundJobs();
  const managedToast = useToast();
  const convex = useConvex();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [isExportingData, startExportTransition] = useTransition();
  const [exportQueued, setExportQueued] = useState(false);
  const cancelledRef = useRef(false);

  // Profiles state
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | undefined>();
  const [deletingProfile, setDeletingProfile] = useState<Profile | undefined>();

  const handleEditProfile = useCallback((profile: Profile) => {
    setEditingProfile(profile);
    setProfileFormOpen(true);
  }, []);

  const handleCreateProfile = useCallback(() => {
    setEditingProfile(undefined);
    setProfileFormOpen(true);
  }, []);

  const handleProfileFormClose = useCallback((open: boolean) => {
    if (!open) {
      setEditingProfile(undefined);
    }
    setProfileFormOpen(open);
  }, []);
  const autoArchiveEnabled = userSettings?.autoArchiveEnabled ?? false;
  const autoArchiveDaysValue = String(userSettings?.autoArchiveDays ?? 30);

  const handleAnonymizeToggle = async (checked: boolean) => {
    await updateUserSettings({ anonymizeForDemo: checked });
  };

  const handleAutoArchiveToggle = async (checked: boolean) => {
    await updateUserSettings({ autoArchiveEnabled: checked });
  };

  const handleAutoArchiveDaysChange = async (value: string | null) => {
    if (!value) {
      return;
    }
    await updateUserSettings({ autoArchiveDays: parseInt(value, 10) });
  };

  const autoArchiveDaysOptions = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
    { value: "60", label: "60 days" },
    { value: "90", label: "90 days" },
  ];

  const fetchAllConversationIds = useCallback(async () => {
    const pageSize = 100;
    let cursor: string | null | undefined;
    let isDone = false;
    const allConversationIds: Id<"conversations">[] = [];

    while (!isDone) {
      const response: unknown = await convex.query(api.conversations.list, {
        includeArchived: true,
        paginationOpts: {
          numItems: pageSize,
          ...(cursor ? { cursor } : {}),
        },
      });

      if (!response) {
        break;
      }

      if (isPaginatedResult(response)) {
        const page = response.page as Array<{ _id: Id<"conversations"> }>;
        allConversationIds.push(...page.map(conversation => conversation._id));
        cursor = response.continueCursor ?? undefined;
        isDone = response.isDone ?? true;
        if (page.length === 0) {
          break;
        }
      } else if (Array.isArray(response)) {
        const page = response as Array<{ _id: Id<"conversations"> }>;
        allConversationIds.push(...page.map(conversation => conversation._id));
        isDone = true;
      } else {
        break;
      }
    }

    return Array.from(new Set(allConversationIds));
  }, [convex]);

  const handleExportAllData = useCallback(() => {
    startExportTransition(async () => {
      try {
        const conversationIds = await fetchAllConversationIds();
        if (conversationIds.length === 0) {
          managedToast.error("No conversations found to export");
          return;
        }

        await backgroundJobs.startExport(conversationIds, {
          includeAttachmentContent: true,
        });

        setExportQueued(true);
      } catch (error) {
        managedToast.error("Failed to start export", {
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    });
  }, [backgroundJobs, fetchAllConversationIds, managedToast.error]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    cancelledRef.current = false;

    if (deleteTarget === "conversations") {
      const conversationIds = await fetchAllConversationIds();
      if (conversationIds.length === 0) {
        managedToast.success("No conversations to delete");
        return;
      }
      await backgroundJobs.startBulkDelete(conversationIds);
      managedToast.success("Deleting conversations in the background");
    } else if (deleteTarget === "memories") {
      let hasMore = true;
      while (hasMore && !cancelledRef.current) {
        const result = await clearAllMemories();
        hasMore = result.hasMore;
      }
      managedToast.success("All memories deleted");
    } else if (deleteTarget === "personas") {
      let hasMore = true;
      while (hasMore && !cancelledRef.current) {
        const result = await clearAllPersonas();
        hasMore = result.hasMore;
      }
      managedToast.success("All personas deleted");
    } else if (deleteTarget === "all-data") {
      await clearAllData();
      clearUserData();
      managedToast.success("All data deleted");
    } else if (deleteTarget === "account") {
      await deleteAccountMutation({});
      clearUserData();

      try {
        await signOut();
      } catch (signOutError) {
        console.warn("Sign out after account deletion failed", signOutError);
      }

      managedToast.success("Account deleted");
      navigate("/", { replace: true });
    }

    setDeleteTarget(null);
  }, [
    deleteTarget,
    fetchAllConversationIds,
    backgroundJobs,
    clearAllMemories,
    clearAllPersonas,
    clearAllData,
    deleteAccountMutation,
    signOut,
    managedToast.success,
    navigate,
  ]);

  if (!userSettings) {
    return (
      <SettingsPageLayout>
        <div className="grid stack-6 lg:grid-cols-[minmax(0,280px)_1fr]">
          <aside className="stack-lg">
            <Skeleton className="h-32 w-full" />
          </aside>

          <div className="stack-xl">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <>
      <SettingsPageLayout>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
          <aside className="stack-lg">
            <UserIdCard />
          </aside>

          <main className="stack-12">
            {/* Appearance */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Appearance</h2>
              <ColorSchemeSelector />
            </section>

            {/* Preferences */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Preferences</h2>

              <div className="stack-6">
                {/* Show message metadata */}
                <label
                  htmlFor="metadata-toggle"
                  className="flex items-center justify-between gap-8 cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="font-medium mb-1">
                      Show message metadata
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Display token usage, latency, and other technical details
                    </p>
                  </div>
                  <Switch
                    id="metadata-toggle"
                    checked={userSettings.showMessageMetadata ?? false}
                    onCheckedChange={async checked => {
                      await updateUserSettings({
                        showMessageMetadata: checked,
                      });
                    }}
                  />
                </label>

                <label
                  htmlFor="anonymize-toggle"
                  className="flex items-center justify-between gap-8 cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="font-medium mb-1">Hide personal info</div>
                    <p className="text-sm text-muted-foreground">
                      Obfuscate your name and avatar in the UI
                    </p>
                  </div>
                  <Switch
                    id="anonymize-toggle"
                    checked={userSettings.anonymizeForDemo ?? false}
                    onCheckedChange={handleAnonymizeToggle}
                  />
                </label>

                {/* Show temperature picker */}
                <label
                  htmlFor="temperature-picker-toggle"
                  className="flex items-center justify-between gap-8 cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="font-medium mb-1">
                      Show temperature picker
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Display temperature control in the chat input toolbar
                    </p>
                  </div>
                  <Switch
                    id="temperature-picker-toggle"
                    checked={userSettings.showTemperaturePicker ?? true}
                    onCheckedChange={async checked => {
                      await updateUserSettings({
                        showTemperaturePicker: checked,
                      });
                    }}
                  />
                </label>

                {/* Auto-archive conversations */}
                <div>
                  <label
                    htmlFor="auto-archive-toggle"
                    className="flex items-center justify-between gap-8 mb-3 cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="font-medium mb-1">
                        Auto-archive conversations
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Automatically move inactive conversations to archive
                      </p>
                    </div>
                    <Switch
                      id="auto-archive-toggle"
                      checked={autoArchiveEnabled}
                      onCheckedChange={handleAutoArchiveToggle}
                    />
                  </label>

                  {autoArchiveEnabled && (
                    <div className="ml-0 pl-0 flex items-center justify-left gap-4">
                      <Select
                        value={autoArchiveDaysValue}
                        onValueChange={handleAutoArchiveDaysChange}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {autoArchiveDaysOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Based on last activity. Pinned conversations are
                        excluded.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Profiles */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Profiles</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateProfile}
                  className="shrink-0"
                >
                  <PlusIcon className="size-4 mr-1.5" />
                  New Profile
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                Organize conversations into separate contexts like work,
                personal, or learning.
              </p>

              {(() => {
                if (profilesLoading) {
                  return (
                    <div className="stack-sm">
                      <Skeleton className="h-14 w-full rounded-lg" />
                      <Skeleton className="h-14 w-full rounded-lg" />
                    </div>
                  );
                }

                if (!profiles || profiles.length === 0) {
                  return (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <p className="text-muted-foreground text-sm">
                        No profiles yet. Create your first profile to organize
                        conversations.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="stack-xs">
                    {profiles.map(profile => {
                      const IconComponent = getProfileIconComponent(
                        profile.icon
                      );
                      return (
                        <div
                          key={profile._id}
                          className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                            {IconComponent ? (
                              <IconComponent className="size-5 text-foreground/70" />
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                ?
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {profile.name}
                              </span>
                              {profile.isDefault && (
                                <Badge variant="secondary" className="text-xs">
                                  Default
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditProfile(profile)}
                              title="Edit profile"
                            >
                              <PencilSimpleIcon className="size-4" />
                            </Button>
                            {!profile.isDefault && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeletingProfile(profile)}
                                title="Delete profile"
                              >
                                <TrashIcon className="size-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>

            {/* Data & Privacy */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Data & Privacy</h2>

              <div className="stack-6">
                {/* Export */}
                <div>
                  <div className="font-medium mb-1">
                    Export conversation archive
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Download a complete backup of your conversations,
                    attachments, personas, and memories
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      variant="primary"
                      onClick={handleExportAllData}
                      loading={isExportingData}
                    >
                      <DownloadSimpleIcon className="mr-2 size-4" />
                      Export data
                    </Button>
                    {exportQueued && (
                      <p className="text-xs text-muted-foreground">
                        Export queued. Check Chat History for progress.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* About */}
            <section>
              <h2 className="text-lg font-semibold mb-4">About</h2>

              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  Polly is an open source AI chat application. Contributions and
                  feedback welcome.
                </p>
                <Button
                  render={
                    <a
                      href="https://github.com/slowedreverbd/polly"
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                  className="w-fit"
                  size="default"
                  variant="primary"
                >
                  <GithubLogoIcon className="size-4" />
                  View on GitHub
                </Button>
              </div>
            </section>

            {/* Danger Zone */}
            <section>
              <h2 className="text-lg font-semibold mb-4">Danger Zone</h2>

              <div className="rounded-lg border border-destructive/30 divide-y divide-destructive/15 overflow-hidden">
                {[
                  {
                    target: "conversations" as const,
                    label: "Delete all conversations",
                    desc: "Remove all conversations, messages, and attachments",
                  },
                  {
                    target: "memories" as const,
                    label: "Delete all memories",
                    desc: "Clear everything Polly has remembered about you",
                  },
                  {
                    target: "personas" as const,
                    label: "Delete all personas",
                    desc: "Remove all custom personas and their settings",
                  },
                ].map(item => (
                  <div
                    key={item.target}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{item.label}</div>
                      <p className="text-sm text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTarget(item.target)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}

                <div className="bg-destructive/5 px-4 py-3 stack-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">Delete all data</div>
                      <p className="text-sm text-muted-foreground">
                        Erase all your data but keep your account
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setDeleteTarget("all-data")}
                    >
                      <TrashIcon className="mr-1.5 size-3.5" />
                      Delete all data
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">Delete account</div>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all data
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setDeleteTarget("account")}
                    >
                      <TrashIcon className="mr-1.5 size-3.5" />
                      Delete account
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </SettingsPageLayout>

      <ProfileFormDialog
        open={profileFormOpen}
        onOpenChange={handleProfileFormClose}
        profile={editingProfile}
      />

      {deletingProfile && profiles && (
        <ProfileDeleteDialog
          open={!!deletingProfile}
          onOpenChange={open => {
            if (!open) {
              setDeletingProfile(undefined);
            }
          }}
          profile={deletingProfile}
          otherProfiles={profiles.filter(p => p._id !== deletingProfile._id)}
        />
      )}

      {deleteTarget && (
        <ConfirmationDialog
          open={!!deleteTarget}
          onOpenChange={open => {
            if (!open) {
              cancelledRef.current = true;
              setDeleteTarget(null);
            }
          }}
          title={DELETE_CONFIGS[deleteTarget].title}
          description={DELETE_CONFIGS[deleteTarget].description}
          confirmText={DELETE_CONFIGS[deleteTarget].confirmLabel}
          variant="destructive"
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            cancelledRef.current = true;
          }}
        >
          {DELETE_CONFIGS[deleteTarget].showExportHint && (
            <p className="text-sm text-muted-foreground">
              Need a copy first? Export your data from{" "}
              <span className="text-foreground font-medium">
                Data & Privacy
              </span>{" "}
              before proceeding.
            </p>
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}
