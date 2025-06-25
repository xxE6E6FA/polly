import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react";
import { MONTHLY_MESSAGE_LIMIT } from "@/lib/constants";

export default function AboutPage() {
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
            <p className="text-sm text-muted-foreground mb-2">
              Polly is a modern AI chat application that lets you chat with
              multiple AI models using your own API keys.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              It also allows you to use Google&apos;s Gemini 2.5 Flash Lite
              model for free, up to {MONTHLY_MESSAGE_LIMIT} messages per month.
            </p>
            <h3 className="font-semibold text-sm mb-2">Competition Entry</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Polly was created as part of the{" "}
              <a
                href="https://cloneathon.t3.chat/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                T3 Chat Cloneathon
                <ArrowSquareOutIcon className="h-3 w-3" />
              </a>
              , an open source competition challenging developers to build
              innovative AI chat applications that compete with{" "}
              <a
                href="https://t3.chat/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                T3 Chat
                <ArrowSquareOutIcon className="h-3 w-3" />
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">Key Features</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
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
            <h3 className="font-semibold text-sm mb-2">Built With</h3>
            <p className="text-sm text-muted-foreground">
              React, Vite, React Router, Convex, Vercel AI SDK, and Tailwind CSS
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4 sm:pb-6">
          <CardTitle className="text-lg sm:text-xl">Open Source</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Found a bug or have a feature request? Check out the GitHub
            repository to report issues, submit pull requests, or star the
            project if you find it useful.
          </p>
          <Button
            asChild
            variant="default"
            size="default"
            className="w-full sm:w-auto"
          >
            <a
              href="https://github.com/slowedreverbd/polly"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2"
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
