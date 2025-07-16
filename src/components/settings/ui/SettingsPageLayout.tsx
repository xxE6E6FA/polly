import { cn } from "@/lib/utils";

interface SettingsPageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const SettingsPageLayout = ({
  children,
  className,
}: SettingsPageLayoutProps) => {
  return (
    <div className={cn("mx-auto max-w-4xl space-y-6", className)}>
      {children}
    </div>
  );
};
