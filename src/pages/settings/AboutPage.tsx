import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useUserSettings,
  useUserSettingsMutations,
} from "@/hooks/use-user-settings";
import { MONTHLY_MESSAGE_LIMIT } from "@/lib/constants";

export default function AboutPage() {
  const userSettings = useUserSettings();
  const { updateUserSettings } = useUserSettingsMutations();

  const handleAnonymizeToggle = async (checked: boolean) => {
    await updateUserSettings({ anonymizeForDemo: checked });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            About This Project
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              Polly is a modern AI chat application that lets you chat with
              multiple AI models using your own API keys.
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              It also allows you to use Google&apos;s Gemini 2.5 Flash Lite
              model for free, up to {MONTHLY_MESSAGE_LIMIT} messages per month.
            </p>
            <h3 className="mb-2 text-sm font-semibold">Competition Entry</h3>
            <p className="mb-2 text-sm text-muted-foreground">
              Polly was created as part of the{" "}
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href="https://cloneathon.t3.chat/"
                rel="noopener noreferrer"
                target="_blank"
              >
                T3 Chat Cloneathon
                <ArrowSquareOutIcon className="h-3 w-3" />
              </a>
              , an open source competition challenging developers to build
              innovative AI chat applications that compete with{" "}
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href="https://t3.chat/"
                rel="noopener noreferrer"
                target="_blank"
              >
                T3 Chat
                <ArrowSquareOutIcon className="h-3 w-3" />
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Key Features</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>
                  Switch between multiple AI providers (OpenAI, Anthropic,
                  Google, OpenRouter)
                </span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Upload images and PDFs for analysis</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Custom personas and model settings</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>
                  Explore subjects with auto-generated conversation starters
                </span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Branch existing conversations into new ones</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Share conversations with others</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Export conversations as Markdown or JSON</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Built With</h3>
            <p className="text-sm text-muted-foreground">
              React, Vite, React Router, Convex, Vercel AI SDK, and Tailwind CSS
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4 sm:pb-6">
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
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="text-lg sm:text-xl">Open Source</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Found a bug or have a feature request? Check out the GitHub
            repository to report issues, submit pull requests, or star the
            project if you find it useful.
          </p>
          <Button
            asChild
            className="w-full sm:w-auto"
            size="default"
            variant="default"
          >
            <a
              className="flex items-center justify-center gap-2"
              href="https://github.com/slowedreverbd/polly"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GithubLogoIcon className="h-4 w-4" />
              View on GitHub
              <ArrowSquareOutIcon className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
