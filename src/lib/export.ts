import type { ExportData } from "@/types";
import { stripCitations } from "./utils";

export function exportAsJSON(data: ExportData): string {
  if (!data?.conversation) {
    throw new Error("Conversation data is required for export");
  }

  return JSON.stringify(
    {
      source: "Polly",
      version: "1.0.0",
      exportedAt: Date.now(),
      conversations: [
        {
          title: data.conversation.title,
          createdAt: data.conversation.createdAt,
          updatedAt: data.conversation.updatedAt,
          messages: data.messages.map(message => ({
            role: message.role,
            content: stripCitations(message.content),
            reasoning: message.reasoning
              ? stripCitations(message.reasoning)
              : undefined,
            model: message.model,
            provider: message.provider,
            useWebSearch: message.useWebSearch,
            attachments: message.attachments,
            citations: message.citations,
            createdAt: message.createdAt,
            metadata: message.metadata,
          })),
        },
      ],
    },
    null,
    2
  );
}

export function exportAsMarkdown(data: ExportData): string {
  if (!data?.conversation) {
    throw new Error("Conversation data is required for export");
  }

  const { conversation, messages } = data;

  let markdown = `# ${conversation.title}\n\n`;
  markdown += `**Created:** ${new Date(conversation.createdAt).toLocaleString()}\n`;
  markdown += `**Updated:** ${new Date(conversation.updatedAt).toLocaleString()}\n\n`;
  markdown += "---\n\n";

  for (const message of messages) {
    if (message.role === "system" || message.role === "context") {
      continue;
    }

    const timestamp = new Date(message.createdAt).toLocaleString();
    const roleEmoji = message.role === "user" ? "👤" : "🤖";
    const roleName = message.role === "user" ? "User" : "Assistant";

    markdown += `## ${roleEmoji} ${roleName}\n`;
    markdown += `*${timestamp}*\n\n`;

    if (message.model) {
      markdown += `**Model:** ${message.model}`;
      if (message.provider) {
        markdown += ` (${message.provider})`;
      }
      markdown += "\n\n";
    }

    if (message.attachments && message.attachments.length > 0) {
      markdown += "**Attachments:**\n";
      for (const attachment of message.attachments) {
        markdown += `- ${attachment.name} (${attachment.type})\n`;
      }
      markdown += "\n";
    }

    if (message.reasoning) {
      markdown += "### Reasoning\n\n";
      markdown += `${stripCitations(message.reasoning)}\n\n`;
    }

    markdown += `${stripCitations(message.content)}\n\n`;

    if (message.citations && message.citations.length > 0) {
      markdown += "**Sources:**\n";
      for (let i = 0; i < message.citations.length; i++) {
        const citation = message.citations[i];
        if (!citation) {
          continue;
        }
        markdown += `${i + 1}. [${citation.title}](${citation.url})\n`;
        if (citation.snippet) {
          markdown += `   > ${citation.snippet}\n`;
        }
      }
      markdown += "\n";
    }

    markdown += "---\n\n";
  }

  return markdown;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
) {
  triggerBlobDownload(new Blob([content], { type: mimeType }), filename);
}

/**
 * Copy an image from a URL to the clipboard.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<void> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

/**
 * Extract a known image file extension from a URL pathname.
 * Returns "png" if the URL has no recognizable image extension
 * (e.g. Convex storage URLs like `/api/storage/abc123`).
 */
function extractImageExtension(imageUrl: string): string {
  const knownExts = new Set([
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "svg",
    "avif",
  ]);
  let urlPath: string;
  try {
    urlPath = new URL(imageUrl).pathname;
  } catch {
    return "png";
  }
  const lastSegment = urlPath.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex > 0) {
    const ext = lastSegment.slice(dotIndex + 1).toLowerCase();
    if (knownExts.has(ext)) {
      return ext;
    }
  }
  return "png";
}

/**
 * Generate a download filename for a generated image.
 */
export function generateImageFilename(
  imageUrl: string,
  prompt?: string | null,
  suffix?: string
): string {
  const timestamp = new Date().toISOString().split("T")[0];
  const baseFilename = prompt
    ? prompt
        .slice(0, 50)
        .replace(/[^\d\sA-Za-z-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
    : "generated-image";
  const extension = extractImageExtension(imageUrl);
  return suffix
    ? `${baseFilename}-${timestamp}-${suffix}.${extension}`
    : `${baseFilename}-${timestamp}.${extension}`;
}

export async function downloadFromUrl(
  downloadUrl: string,
  filename: string
): Promise<void> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  triggerBlobDownload(await response.blob(), filename);
}

export function generateFilename(title: string, format: "json" | "md"): string {
  const sanitized = title
    .replace(/[^\d\sA-Za-z-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  const timestamp = new Date().toISOString().split("T")[0];
  return `${sanitized}-${timestamp}.${format}`;
}

type ExportManifestSummary = {
  totalConversations: number;
  includeAttachments?: boolean;
};

export function generateBackgroundExportFilename(
  manifest?: ExportManifestSummary | null
): string {
  if (!manifest) {
    return "export.json";
  }

  const timestamp = new Date().toISOString().split("T")[0];
  const conversationCount = manifest.totalConversations;
  const extension = manifest.includeAttachments ? "zip" : "json";
  return `polly-export-${conversationCount}-conversations-${timestamp}.${extension}`;
}
