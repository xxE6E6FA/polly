import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { Key, Bot, Users, Info } from "lucide-react";
import { UserIdCard } from "./user-id-card";

interface SettingsContainerProps {
  children: React.ReactNode;
  className?: string;
}

const settingsNavItems = [
  {
    href: ROUTES.SETTINGS.API_KEYS,
    label: "API Keys",
    icon: Key,
  },
  {
    href: ROUTES.SETTINGS.MODELS,
    label: "Models",
    icon: Bot,
  },
  {
    href: ROUTES.SETTINGS.PERSONAS,
    label: "Personas",
    icon: Users,
  },
  {
    href: ROUTES.SETTINGS.ABOUT,
    label: "About",
    icon: Info,
  },
];

export function SettingsContainer({
  children,
  className = "",
}: SettingsContainerProps) {
  const location = useLocation();

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 w-full flex-1">
      <div className="flex gap-8">
        {/* Left Navigation */}
        <div className="w-64 flex-shrink-0 space-y-6">
          <nav>
            <div className="space-y-1">
              {settingsNavItems.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User ID Card */}
          <UserIdCard />
        </div>

        {/* Main Content */}
        <div className={cn("flex-1 min-w-0", className)}>{children}</div>
      </div>
    </div>
  );
}
