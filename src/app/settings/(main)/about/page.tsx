"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExternalLink, Github, Globe } from "lucide-react";

export default function AboutPage() {
  const links = [
    {
      href: "https://pcalv.es",
      icon: Globe,
      label: "Personal Website",
    },
    {
      href: "https://x.com/slowedreverbd",
      icon: ExternalLink,
      label: "X / Twitter",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
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
              model for free, up to 500 messages per month.
            </p>
            <h3 className="font-semibold text-sm mb-2">Competition Entry</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Polly was created as part of the{" "}
              <a
                href="https://cloneathon.t3.chat/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                T3 Chat Cloneathon
              </a>
              , an open source competition challenging developers to build
              innovative AI chat applications that compete with{" "}
              <a
                href="https://t3.chat/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                T3 Chat
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">Key Features</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>
                • Switch between multiple AI providers (OpenAI, Anthropic,
                Google, OpenRouter)
              </li>
              <li>• Upload images and PDFs for analysis</li>
              <li>• Custom personas and model settings</li>
              <li>
                • Explore subjects with auto-generated conversation starters
              </li>
              <li>• Branch existing conversations into new ones</li>
              <li>• Share conversations with others</li>
              <li>• Export conversations as Markdown or JSON</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">Built With</h3>
            <p className="text-sm text-muted-foreground">
              Next.js, Convex, Vercel AI SDK, and Tailwind CSS
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Open Source</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Found a bug or have a feature request? Check out the GitHub
            repository to report issues, submit pull requests, or star the
            project if you find it useful.
          </p>
          <Button asChild variant="default" size="lg">
            <a
              href="https://github.com/slowedreverbd/polly"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <Github className="h-4 w-4" />
              View on GitHub
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About the Creator</CardTitle>
          <CardDescription>
            Built by Paulo, Engineering Manager at{" "}
            <a
              href="https://plex.tv"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Plex
            </a>
            , based in Lisboa, Portugal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-3">
            {links.map(link => (
              <Button
                key={link.href}
                variant="outline"
                asChild
                className="justify-start h-auto p-4"
              >
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3"
                >
                  <link.icon className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <div className="font-medium">{link.label}</div>
                  </div>
                  <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground" />
                </a>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
