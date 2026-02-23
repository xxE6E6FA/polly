import { useClerk } from "@clerk/clerk-react";
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
import { useCallback, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { ColorSchemeSelector } from "@/components/settings/color-scheme-selector";
import { ProfileDeleteDialog } from "@/components/settings/profile-delete-dialog";
import { ProfileFormDialog } from "@/components/settings/profile-form-dialog";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { UserIdCard } from "@/components/settings/user-id-card";
import { Alert, AlertDescription, AlertIcon } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const backgroundJobs = useBackgroundJobs();
  const managedToast = useToast();
  const convex = useConvex();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExportingData, startExportTransition] = useTransition();
  const [exportQueued, setExportQueued] = useState(false);
  const [isDeletingAccount, startDeleteTransition] = useTransition();

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

  const handleDeleteAccount = useCallback(() => {
    startDeleteTransition(async () => {
      try {
        await deleteAccountMutation({});
        clearUserData();

        try {
          await signOut();
        } catch (signOutError) {
          console.warn("Sign out after account deletion failed", signOutError);
        }

        managedToast.success("Account deleted");
        setShowDeleteDialog(false);
        navigate("/", { replace: true });
      } catch (error) {
        managedToast.error("Failed to delete account", {
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    });
  }, [
    deleteAccountMutation,
    signOut,
    managedToast.success,
    managedToast.error,
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
                    Download a complete backup of your conversations and
                    attachments
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

              <div>
                <div className="font-medium mb-1">Delete account</div>
                <p className="text-sm text-muted-foreground mb-3">
                  Permanently delete your account and all associated data
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <TrashIcon className="mr-2 size-4" />
                  Delete Account
                </Button>
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

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              Deleting your account removes all of your data from Polly.
            </DialogDescription>
          </DialogHeader>

          <div className="stack-lg">
            <Alert variant="warning">
              <AlertIcon variant="warning" />
              <AlertDescription>
                This is permanent. All conversations, attachments, models, and
                settings will be erased immediately.
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">
              Need a copy first? Export your data from Data & Privacy before
              deleting your account.
            </p>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeletingAccount}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              loading={isDeletingAccount}
            >
              <TrashIcon className="mr-2 size-4" />
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
