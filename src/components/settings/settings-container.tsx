import {
  ArchiveIcon,
  CloudArrowDownIcon,
  GearIcon,
  KeyIcon,
  PaperclipIcon,
  RobotIcon,
  ShareNetworkIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { Link, useLocation, useNavigate } from "react-router";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type SettingsContainerProps = {
  children: React.ReactNode;
  className?: string;
};

const settingsNavItems = [
  {
    href: ROUTES.SETTINGS.GENERAL,
    label: "General",
    icon: GearIcon,
  },
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
    href: ROUTES.SETTINGS.SHARED_CONVERSATIONS,
    label: "Shares",
    icon: ShareNetworkIcon,
  },
  {
    href: ROUTES.SETTINGS.ARCHIVED_CONVERSATIONS,
    label: "Archive",
    icon: ArchiveIcon,
  },
  {
    href: ROUTES.SETTINGS.CHAT_HISTORY,
    label: "Chat History",
    icon: CloudArrowDownIcon,
  },
  {
    href: ROUTES.SETTINGS.ATTACHMENTS,
    label: "Attachments",
    icon: PaperclipIcon,
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
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
      {/* Mobile Navigation */}
      <div className="mb-6 sm:hidden">
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
      </div>

      {/* Desktop Horizontal Tabs */}
      <div className="hidden sm:block">
        <nav className="mb-6">
          <div className="w-fit">
            <div className="bg-muted/60 rounded-lg p-2 mb-6 shadow-sm ring-1 ring-border/30">
              <div className="flex space-x-2 overflow-x-auto">
                {settingsNavItems.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>

        {/* Desktop Content */}
        <div className={cn("w-full", className)}>{children}</div>
      </div>

      {/* Mobile Content */}
      <div className={cn("sm:hidden", className)}>{children}</div>
    </div>
  );
};
