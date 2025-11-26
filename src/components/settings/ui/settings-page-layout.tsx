import { cn } from "@/lib/utils";

interface SettingsPageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const SettingsPageLayout = ({
  children,
  className,
}: SettingsPageLayoutProps) => {
  // Width is handled by parent container (settings-container.tsx)
  // This component only handles vertical spacing
  return <div className={cn("w-full stack-xl", className)}>{children}</div>;
};
