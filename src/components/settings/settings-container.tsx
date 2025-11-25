import {
  ArchiveIcon,
  ChatTextIcon,
  CloudArrowDownIcon,
  GearIcon,
  ImageIcon,
  KeyIcon,
  PaperclipIcon,
  RobotIcon,
  ShareNetworkIcon,
  SpeakerHighIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { Link, useLocation } from "react-router-dom";

import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui-provider";
import { MobileSettingsNav } from "./mobile/MobileSettingsNav";

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
    href: ROUTES.SETTINGS.TEXT_MODELS,
    label: "Models",
    icon: RobotIcon,
    subItems: [
      {
        href: ROUTES.SETTINGS.TEXT_MODELS,
        label: "Text",
        icon: ChatTextIcon,
      },
      {
        href: ROUTES.SETTINGS.IMAGE_MODELS,
        label: "Image",
        icon: ImageIcon,
      },
      {
        href: ROUTES.SETTINGS.TTS_MODELS,
        label: "TTS",
        icon: SpeakerHighIcon,
      },
    ],
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
  const { isMobile } = useUI();

  // On mobile, use the swipeable carousel navigation
  if (isMobile) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <MobileSettingsNav />
      </div>
    );
  }

  // Desktop: Use horizontal tabs with React Router children
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
      {/* Desktop Horizontal Tabs */}
      <div>
        <nav className="mb-6">
          <div className="w-fit">
            <div className="bg-muted/60 rounded-lg p-2 shadow-sm ring-1 ring-border/30">
              {/* Main navigation row */}
              <div className="flex space-x-2 overflow-visible">
                {settingsNavItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  const isParentActive = item.subItems?.some(sub =>
                    location.pathname.startsWith(sub.href)
                  );

                  return (
                    <div key={item.href} className="relative">
                      <Link
                        to={item.href}
                        className={cn(
                          "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          isActive || isParentActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.label}
                      </Link>

                      {/* Sub-navigation directly below this item */}
                      {item.subItems?.some(sub =>
                        location.pathname.startsWith(sub.href)
                      ) && (
                        <div className="absolute top-full left-0 mt-4 z-10">
                          <div className="bg-muted/60 rounded-lg p-2 shadow-sm ring-1 ring-border/30">
                            <div className="flex space-x-2">
                              {item.subItems.map(subItem => {
                                const SubIcon = subItem.icon;
                                const isActive =
                                  location.pathname === subItem.href;

                                return (
                                  <Link
                                    key={subItem.href}
                                    to={subItem.href}
                                    className={cn(
                                      "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                      isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                                    )}
                                  >
                                    <SubIcon className="h-3.5 w-3.5" />
                                    {subItem.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Spacer to push content down when sub-nav is visible */}
            {settingsNavItems.some(item =>
              item.subItems?.some(sub => location.pathname.startsWith(sub.href))
            ) && <div className="h-12" />}
          </div>
        </nav>

        {/* Desktop Content */}
        <div className={cn("w-full", className)}>{children}</div>
      </div>
    </div>
  );
};
