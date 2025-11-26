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
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui-provider";
import { MobileSettingsNav } from "./mobile/MobileSettingsNav";
import { type SettingsTabItem, SettingsTabs } from "./SettingsTabs";

type SettingsContainerProps = {
  children: React.ReactNode;
  className?: string;
};

// Main navigation tabs (shared structure)
const mainTabs: SettingsTabItem[] = [
  { path: ROUTES.SETTINGS.GENERAL, label: "General", icon: GearIcon },
  { path: ROUTES.SETTINGS.API_KEYS, label: "API Keys", icon: KeyIcon },
  { path: ROUTES.SETTINGS.TEXT_MODELS, label: "Models", icon: RobotIcon },
  { path: ROUTES.SETTINGS.PERSONAS, label: "Personas", icon: UsersIcon },
  {
    path: ROUTES.SETTINGS.SHARED_CONVERSATIONS,
    label: "Shares",
    icon: ShareNetworkIcon,
  },
  {
    path: ROUTES.SETTINGS.ARCHIVED_CONVERSATIONS,
    label: "Archive",
    icon: ArchiveIcon,
  },
  {
    path: ROUTES.SETTINGS.CHAT_HISTORY,
    label: "History",
    icon: CloudArrowDownIcon,
  },
  {
    path: ROUTES.SETTINGS.ATTACHMENTS,
    label: "Files",
    icon: PaperclipIcon,
  },
];

// Sub-navigation for Models section
const modelSubTabs: SettingsTabItem[] = [
  { path: ROUTES.SETTINGS.TEXT_MODELS, label: "Text", icon: ChatTextIcon },
  { path: ROUTES.SETTINGS.IMAGE_MODELS, label: "Image", icon: ImageIcon },
  { path: ROUTES.SETTINGS.TTS_MODELS, label: "TTS", icon: SpeakerHighIcon },
];

export const SettingsContainer = ({
  children,
  className = "",
}: SettingsContainerProps) => {
  const location = useLocation();
  const { isMobile } = useUI();

  // Determine active tab index
  const activeMainIndex = useMemo(() => {
    // Check for models sub-routes first
    const isModelsRoute = modelSubTabs.some(tab =>
      location.pathname.startsWith(tab.path)
    );
    if (isModelsRoute) {
      return mainTabs.findIndex(
        tab => tab.path === ROUTES.SETTINGS.TEXT_MODELS
      );
    }

    // Find exact match
    const exactMatch = mainTabs.findIndex(
      tab => location.pathname === tab.path
    );
    if (exactMatch !== -1) {
      return exactMatch;
    }

    // Fall back to first tab
    return 0;
  }, [location.pathname]);

  // Determine if we're in models section and which sub-tab is active
  const isModelsSection = modelSubTabs.some(tab =>
    location.pathname.startsWith(tab.path)
  );
  const activeSubIndex = useMemo(() => {
    if (!isModelsSection) {
      return 0;
    }
    const index = modelSubTabs.findIndex(tab => location.pathname === tab.path);
    return index !== -1 ? index : 0;
  }, [isModelsSection, location.pathname]);

  // On mobile, use the swipeable carousel navigation
  if (isMobile) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 min-h-0 px-4 pt-6 flex flex-col">
        <MobileSettingsNav />
      </div>
    );
  }

  // Desktop: Use horizontal tabs with React Router children
  // Window handles scrolling, nav is sticky at top
  return (
    <div className="flex-1" style={{ scrollbarGutter: "stable" }}>
      {/* Sticky navigation container */}
      <div className="sticky top-0 z-sticky bg-background pb-3">
        <div className="mx-auto w-full max-w-4xl px-4 pt-3 stack-sm">
          {/* Main Navigation Tabs */}
          <nav>
            <SettingsTabs
              tabs={mainTabs}
              activeIndex={activeMainIndex}
              layoutId="settings-main-tab"
            />
          </nav>

          {/* Sub-navigation for Models section */}
          {isModelsSection && (
            <nav>
              <SettingsTabs
                tabs={modelSubTabs}
                activeIndex={activeSubIndex}
                layoutId="settings-sub-tab"
              />
            </nav>
          )}
        </div>
      </div>

      {/* Content area - scrolls with window */}
      <div className="mx-auto w-full max-w-4xl px-4 pb-6">
        <div className={cn("w-full", className)}>{children}</div>
      </div>
    </div>
  );
};
