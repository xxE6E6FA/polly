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
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-sm group-[.toaster]:rounded-xl font-sans text-sm",
          description:
            "group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:leading-relaxed",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-primary/90 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-muted/80 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          success:
            "group-[.toaster]:bg-[hsl(var(--color-success-bg))] group-[.toaster]:border-[hsl(var(--color-success-border))] group-[.toaster]:text-emerald-700 dark:group-[.toaster]:text-emerald-400",
          error:
            "group-[.toaster]:bg-[hsl(var(--color-danger-bg))] group-[.toaster]:border-[hsl(var(--color-danger-border))] group-[.toaster]:text-red-700 dark:group-[.toaster]:text-red-400",
          warning:
            "group-[.toaster]:bg-[hsl(var(--color-warning-bg))] group-[.toaster]:border-[hsl(var(--color-warning-border))] group-[.toaster]:text-amber-700 dark:group-[.toaster]:text-amber-400",
          info: "group-[.toaster]:bg-[hsl(var(--color-info-bg))] group-[.toaster]:border-[hsl(var(--color-info-border))] group-[.toaster]:text-blue-700 dark:group-[.toaster]:text-blue-400",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
