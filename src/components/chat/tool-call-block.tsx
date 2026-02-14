import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/types";

const ICON_SIZE = "h-4 w-4";

type ToolCallBlockProps = {
  toolCall: ToolCall;
};

// Tool-specific icons and labels
const TOOL_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  webSearch: {
    icon: (
      <svg
        className={ICON_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    label: "Web Search",
  },
  conversationSearch: {
    icon: (
      <svg
        className={ICON_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
    label: "Conversation Search",
  },
  generateImage: {
    icon: (
      <svg
        className={ICON_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
    label: "Image Generation",
  },
};

// Default config for unknown tools
const DEFAULT_TOOL_CONFIG = {
  icon: (
    <svg
      className={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  label: "Tool",
};

const CheckIcon = () => (
  <svg
    className={cn(ICON_SIZE, "text-success")}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ErrorIcon = () => (
  <svg
    className={cn(ICON_SIZE, "text-danger")}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </svg>
);

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}...`;
}

function getImageGenLabel(
  args: ToolCall["args"],
  isRunning: boolean
): string | null {
  if (!args?.prompt) {
    return null;
  }
  const promptPreview = truncate(args.prompt, isRunning ? 30 : 40);
  const modelName = args.imageModel
    ? args.imageModel.split("/").pop() || args.imageModel
    : undefined;
  if (isRunning) {
    const suffix = modelName ? ` with ${modelName}` : "";
    return `Generating "${promptPreview}"${suffix}...`;
  }
  const suffix = modelName ? ` with ${modelName}` : "";
  return `Generated "${promptPreview}"${suffix}`;
}

/**
 * Displays a single tool call as a compact line in the activity stream.
 * Shows: status icon, label, and optional error.
 */
export const ToolCallBlock = ({ toolCall }: ToolCallBlockProps) => {
  const { name, status, args, error } = toolCall;
  const config = TOOL_CONFIG[name] ?? DEFAULT_TOOL_CONFIG;
  const isRunning = status === "running";

  let runningLabel: string;
  let completedLabel: string;

  if (name === "generateImage") {
    const imageLabel = getImageGenLabel(args, isRunning);
    runningLabel = imageLabel ?? `${config.label}...`;
    completedLabel = getImageGenLabel(args, false) ?? config.label;
  } else {
    runningLabel = args?.query
      ? `Searching for "${truncate(args.query, 30)}"`
      : `${config.label}...`;
    completedLabel = args?.query
      ? `Searched for "${truncate(args.query, 40)}"`
      : config.label;
  }

  let statusIcon = <Spinner size="sm" />;
  if (status === "completed") {
    statusIcon = <CheckIcon />;
  } else if (status === "error") {
    statusIcon = <ErrorIcon />;
  }

  const label = isRunning ? runningLabel : completedLabel;

  return (
    <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
      {statusIcon}
      <span className={cn("truncate", isRunning && "thinking-pulse")}>
        {label}
      </span>
      {error && <span className="text-danger truncate">{error}</span>}
    </div>
  );
};
