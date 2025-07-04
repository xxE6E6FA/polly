import { GithubLogoIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserIdCard } from "@/components/settings/user-id-card";
import {
  useUserSettings,
  useUserSettingsMutations,
} from "@/hooks/use-user-settings";

export default function GeneralPage() {
  const userSettings = useUserSettings();
  const { updateUserSettings } = useUserSettingsMutations();

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

  return (
    <div className="flex gap-6 max-w-4xl mx-auto">
      {/* Left Side - User ID Card */}
      <div className="hidden lg:block w-64 flex-shrink-0">
        <UserIdCard />
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        <Card>
          <CardHeader className="pb-6">
            <CardTitle className="text-lg sm:text-xl">Auto-Archive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="auto-archive-toggle"
                  className="text-base font-normal"
                >
                  Enable Auto-Archive
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically archive old conversations after a specified time
                </p>
              </div>
              <Switch
                id="auto-archive-toggle"
                checked={userSettings?.autoArchiveEnabled ?? false}
                onCheckedChange={handleAutoArchiveToggle}
              />
            </div>

            {userSettings?.autoArchiveEnabled && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Archive After</Label>
                <Select
                  value={String(userSettings?.autoArchiveDays ?? 30)}
                  onValueChange={handleAutoArchiveDaysChange}
                >
                  <SelectTrigger className="w-full">
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
                  Conversations will be archived based on their last activity
                  (when you last sent or received a message). Pinned
                  conversations are never auto-archived.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-6">
            <CardTitle className="text-lg sm:text-xl">Privacy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
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
                checked={userSettings?.anonymizeForDemo ?? false}
                onCheckedChange={handleAnonymizeToggle}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-6">
            <CardTitle className="text-lg sm:text-xl">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Polly is an open source AI chat application. Found a bug or have a
              feature request? Contributions and feedback are welcome.
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
