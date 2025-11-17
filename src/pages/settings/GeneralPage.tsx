import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthActions } from "@convex-dev/auth/react";
import { DownloadSimple, GithubLogoIcon, Trash } from "@phosphor-icons/react";
import { useConvex, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsPageLayout } from "@/components/settings/ui/SettingsPageLayout";
import { UserIdCard } from "@/components/settings/user-id-card";
import { Spinner } from "@/components/spinner";
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
import { Label } from "@/components/ui/label";
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
            <Skeleton className="h-24 w-full" />
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

            <div className="stack-lg border-t border-border pt-6">
              <div>
                <h2 className="text-lg font-semibold">Privacy</h2>
              </div>
              <div className="flex items-center justify-between gap-6">
                <div className="stack-xs">
                  <Label
                    htmlFor="anonymize-toggle"
                    className="text-base font-normal"
                  >
                    Anonymize User Data
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Blur your name, email, and avatar in the UI
                  </p>
                </div>
                <Switch
                  id="anonymize-toggle"
                  checked={userSettings.anonymizeForDemo ?? false}
                  onCheckedChange={handleAnonymizeToggle}
                />
              </div>
            </div>
          </aside>

          <main className="stack-xl">
            <section className="stack-lg">
              <div>
                <h2 className="text-lg font-semibold">
                  Conversation Management
                </h2>
              </div>
              <div className="stack-lg">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div className="stack-xs">
                    <Label
                      htmlFor="auto-archive-toggle"
                      className="text-base font-normal"
                    >
                      Enable Auto-Archive
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically archive conversations after a set time
                    </p>
                  </div>
                  <Switch
                    id="auto-archive-toggle"
                    checked={autoArchiveEnabled}
                    onCheckedChange={handleAutoArchiveToggle}
                  />
                </div>

                {autoArchiveEnabled && (
                  <div className="stack-sm">
                    <Label className="text-sm font-medium">Archive After</Label>
                    <Select
                      value={autoArchiveDaysValue}
                      onValueChange={handleAutoArchiveDaysChange}
                    >
                      <SelectTrigger className="w-full sm:w-60">
                        <SelectValue placeholder="Select days" />
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
                      Conversations archive based on their last activity. Pinned
                      conversations never auto-archive.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="stack-lg border-t border-border pt-8">
              <div>
                <h2 className="text-lg font-semibold">Data Controls</h2>
              </div>
              <div className="stack-lg">
                <div className="stack-xs">
                  <Label className="text-base font-normal">
                    Export Conversation Archive
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Generate a downloadable backup with full conversation and
                    attachment history.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    variant="outline"
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
                        <DownloadSimple className="mr-2 h-4 w-4" />
                        Export data
                      </>
                    )}
                  </Button>
                  {exportQueued && (
                    <p className="text-xs text-muted-foreground">
                      Export queued. Check the Chat History tab for progress.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="stack-lg border-t border-border pt-8">
              <div>
                <h2 className="text-lg font-semibold">About</h2>
              </div>
              <div className="stack-lg">
                <p className="text-sm text-muted-foreground">
                  Polly is an open source AI chat application. Found a bug or
                  have a feature request? Contributions and feedback are
                  welcome.
                </p>
                <Button
                  asChild
                  className="w-full sm:w-auto"
                  size="default"
                  variant="outline"
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

            <section className="stack-lg border-t border-border pt-8">
              <div>
                <h2 className="text-lg font-semibold">Account</h2>
              </div>
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="stack-xs">
                  <Label className="text-base font-normal">
                    Delete Account
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Permanently remove your account, conversations, attachments,
                    and settings. This action cannot be undone.
                  </p>
                </div>
                <div>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete Account
                  </Button>
                </div>
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
              Need a copy first? Start an export from Data Controls before
              deleting your account to keep a backup of your conversations and
              attachments.
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
                  <Trash className="mr-2 h-4 w-4" />
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
