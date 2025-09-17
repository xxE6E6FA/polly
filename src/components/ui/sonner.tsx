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
        success: null,
        error: null,
        warning: null,
        info: null,
        loading: null,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-background text-foreground border-border shadow-sm rounded-xl font-sans text-sm",
          description:
            "group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:leading-relaxed",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-primary/90 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-muted/80 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          success:
            "!bg-[hsl(var(--color-success-bg))] !border-[hsl(var(--color-success-border))] text-emerald-700 dark:text-emerald-400",
          error:
            "!bg-[hsl(var(--color-danger-bg))] !border-[hsl(var(--color-danger-border))] text-red-700 dark:text-red-400",
          warning:
            "!bg-[hsl(var(--color-warning-bg))] !border-[hsl(var(--color-warning-border))] text-amber-700 dark:text-amber-400",
          info: "!bg-[hsl(var(--color-info-bg))] !border-[hsl(var(--color-info-border))] text-blue-700 dark:text-blue-400",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
