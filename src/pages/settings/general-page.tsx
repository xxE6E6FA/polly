import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  DownloadSimpleIcon,
  GithubLogoIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useConvex, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { UserIdCard } from "@/components/settings/user-id-card";
import { Alert, AlertDescription, AlertIcon } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useUserSettings } from "@/hooks/use-user-settings";
import { clearUserData } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";

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
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [exportQueued, setExportQueued] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const autoArchiveEnabled = userSettings?.autoArchiveEnabled ?? false;
  const autoArchiveDaysValue = String(userSettings?.autoArchiveDays ?? 30);

  const handleAnonymizeToggle = async (checked: boolean) => {
    await updateUserSettings({ anonymizeForDemo: checked });
  };

  const handleAutoArchiveToggle = async (checked: boolean) => {
    await updateUserSettings({ autoArchiveEnabled: checked });
  };

  const handleAutoArchiveDaysChange = async (value: string) => {
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

  const handleExportAllData = useCallback(async () => {
    setIsExportingData(true);
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
    } finally {
      setIsExportingData(false);
    }
  }, [backgroundJobs, fetchAllConversationIds, managedToast.error]);

  const handleDeleteAccount = useCallback(async () => {
    setIsDeletingAccount(true);
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
    } finally {
      setIsDeletingAccount(false);
    }
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

          <main>
            {/* Preferences */}
            <section className="mb-12">
              <h2 className="text-lg font-semibold mb-2">Preferences</h2>

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

            {/* Data & Privacy */}
            <section className="mb-12">
              <h2 className="text-lg font-semibold mb-2">Data & Privacy</h2>

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
                      disabled={isExportingData}
                    >
                      {isExportingData ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Starting export...
                        </>
                      ) : (
                        <>
                          <DownloadSimpleIcon className="mr-2 h-4 w-4" />
                          Export data
                        </>
                      )}
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
            <section className="mb-12">
              <h2 className="text-lg font-semibold mb-2">About</h2>

              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  Polly is an open source AI chat application. Contributions and
                  feedback welcome.
                </p>
                <Button
                  className="w-full sm:w-auto"
                  size="default"
                  variant="primary"
                >
                  <a
                    className="flex items-center justify-center gap-2"
                    href="https://github.com/slowedreverbd/polly"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <GithubLogoIcon className="h-4 w-4" />
                    View on GitHub
                  </a>
                </Button>
              </div>
            </section>

            {/* Danger Zone */}
            <section className="mb-12">
              <h2 className="text-lg font-semibold mb-2">Danger Zone</h2>

              <div>
                <div className="font-medium mb-1">Delete account</div>
                <p className="text-sm text-muted-foreground mb-3">
                  Permanently delete your account and all associated data
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <TrashIcon className="mr-2 h-4 w-4" />
                  Delete Account
                </Button>
              </div>
            </section>
          </main>
        </div>
      </SettingsPageLayout>

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
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <TrashIcon className="mr-2 h-4 w-4" />
                  Delete account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
