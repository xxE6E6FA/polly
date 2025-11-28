import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type StatusIndicatorProps = {
  label?: string;
  visible: boolean;
};

/**
 * Always-mounted status indicator that fades in/out.
 * The spinner animation continues running even when hidden,
 * so it doesn't reset when made visible again.
 */
export const StatusIndicator = ({ label, visible }: StatusIndicatorProps) => {
  return (
    <div
      className={cn(
        "mb-2.5 transition-opacity duration-150",
        visible
          ? "opacity-100"
          : "opacity-0 pointer-events-none h-0 overflow-hidden"
      )}
      aria-hidden={!visible}
    >
      <div className="text-sm text-foreground/80">
        <div className="inline-flex items-center gap-2">
          <Spinner className="h-3 w-3" />
          <span className="opacity-80">{label || "Thinking…"}</span>
        </div>
      </div>
    </div>
  );
};
