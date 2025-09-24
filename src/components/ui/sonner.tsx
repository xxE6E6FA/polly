import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/hooks/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      richColors={false}
      theme={theme as ToasterProps["theme"]}
      icons={{
        success: <CheckCircleIcon weight="fill" className="h-4 w-4 shrink-0" />,
        error: <XCircleIcon weight="fill" className="h-4 w-4 shrink-0" />,
        warning: <WarningIcon weight="fill" className="h-4 w-4 shrink-0" />,
        info: <InfoIcon weight="fill" className="h-4 w-4 shrink-0" />,
        loading: null,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast flex items-start gap-3 rounded-xl border border-border/80 bg-background/95 px-4 py-3 shadow-lg shadow-black/5 backdrop-blur-sm transition-all duration-200 dark:bg-background/90",
          description:
            "group-[.toast]:mt-1 group-[.toast]:text-sm group-[.toast]:leading-relaxed text-muted-foreground",
          actionButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-primary/10 group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:text-primary group-[.toast]:hover:bg-primary/15 dark:group-[.toast]:bg-primary/20 dark:group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-muted/80 group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-muted",
          success:
            "bg-[hsl(var(--color-success-bg))] border-[hsl(var(--color-success-border))] text-[hsl(var(--color-success-foreground))]",
          error:
            "bg-[hsl(var(--color-danger-bg))] border-[hsl(var(--color-danger-border))] text-[hsl(var(--color-danger-foreground))]",
          warning:
            "bg-[hsl(var(--color-warning-bg))] border-[hsl(var(--color-warning-border))] text-[hsl(var(--color-warning-foreground))]",
          info: "bg-[hsl(var(--color-info-bg))] border-[hsl(var(--color-info-border))] text-[hsl(var(--color-info-foreground))]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
