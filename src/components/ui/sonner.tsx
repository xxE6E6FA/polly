import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
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
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl font-ui text-body-sm",
          description:
            "group-[.toast]:text-muted-foreground group-[.toast]:text-body-sm group-[.toast]:leading-relaxed",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:hover:bg-primary/90 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-body-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:hover:bg-muted/80 group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-body-sm group-[.toast]:transition-all group-[.toast]:duration-200",
          success:
            "group-[.toaster]:bg-success-bg group-[.toaster]:text-success group-[.toaster]:border-success-border",
          error:
            "group-[.toaster]:bg-danger-bg group-[.toaster]:text-danger group-[.toaster]:border-danger-border",
          warning:
            "group-[.toaster]:bg-warning-bg group-[.toaster]:text-warning-foreground group-[.toaster]:border-warning-border",
          info: "group-[.toaster]:bg-info-bg group-[.toaster]:text-info group-[.toaster]:border-info-border",
        },
      }}
      position="bottom-right"
      richColors={false}
      {...props}
    />
  );
};

export { Toaster };
