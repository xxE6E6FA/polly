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
            "group toast group-[.toaster]:bg-background/95 group-[.toaster]:backdrop-blur-xs group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl font-sans text-sm",
          description:
            "group-[.toast]:text-muted-foreground group-[.toast]:text-sm group-[.toast]:leading-relaxed",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-primary/90 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-muted/80 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          success:
            "group-[.toaster]:bg-emerald-50 dark:group-[.toaster]:bg-emerald-950/50 group-[.toaster]:text-emerald-700 dark:group-[.toaster]:text-emerald-400 group-[.toaster]:border-emerald-200 dark:group-[.toaster]:border-emerald-900",
          error:
            "group-[.toaster]:bg-red-50 dark:group-[.toaster]:bg-red-950/50 group-[.toaster]:text-red-700 dark:group-[.toaster]:text-red-400 group-[.toaster]:border-red-200 dark:group-[.toaster]:border-red-900",
          warning:
            "group-[.toaster]:bg-amber-50 dark:group-[.toaster]:bg-amber-950/50 group-[.toaster]:text-amber-700 dark:group-[.toaster]:text-amber-400 group-[.toaster]:border-amber-200 dark:group-[.toaster]:border-amber-900",
          info: "group-[.toaster]:bg-blue-50 dark:group-[.toaster]:bg-blue-950/50 group-[.toaster]:text-blue-700 dark:group-[.toaster]:text-blue-400 group-[.toaster]:border-blue-200 dark:group-[.toaster]:border-blue-900",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
