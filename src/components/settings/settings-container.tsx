import { Link, useLocation, useNavigate } from "react-router";

import { InfoIcon, KeyIcon, RobotIcon, UsersIcon } from "@phosphor-icons/react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { UserIdCard } from "./user-id-card";

type SettingsContainerProps = {
  children: React.ReactNode;
  className?: string;
};

const settingsNavItems = [
  {
    href: ROUTES.SETTINGS.API_KEYS,
    label: "API Keys",
    icon: KeyIcon,
  },
  {
    href: ROUTES.SETTINGS.MODELS,
    label: "Models",
    icon: RobotIcon,
  },
  {
    href: ROUTES.SETTINGS.PERSONAS,
    label: "Personas",
    icon: UsersIcon,
  },
  {
    href: ROUTES.SETTINGS.ABOUT,
    label: "About",
    icon: InfoIcon,
  },
];

export const SettingsContainer = ({
  children,
  className = "",
}: SettingsContainerProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const currentItem = settingsNavItems.find(
    item => location.pathname === item.href
  );

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-8">
      {/* Mobile Navigation */}
      <div className="mb-6 lg:hidden">
        <Select value={location.pathname} onValueChange={navigate}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {currentItem && (
                <div className="flex items-center gap-2">
                  <currentItem.icon className="h-4 w-4" />
                  <span>{currentItem.label}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {settingsNavItems.map(item => {
              const Icon = item.icon;
              return (
                <SelectItem key={item.href} value={item.href}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Mobile User ID Card */}
        <div className="mt-4">
          <UserIdCard />
        </div>
      </div>

      <div className="flex gap-6 lg:gap-8">
        {/* Desktop Navigation */}
        <div className="hidden w-64 flex-shrink-0 space-y-6 lg:block">
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
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-foreground border border-blue-500/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Desktop User ID Card */}
          <UserIdCard />
        </div>

        {/* Main Content */}
        <div className={cn("flex-1 min-w-0", className)}>{children}</div>
      </div>
    </div>
  );
};
