import {
  BrainIcon,
  ChatTextIcon,
  ClockIcon,
  GearIcon,
  ImageIcon,
  KeyIcon,
  PaperclipIcon,
  RobotIcon,
  SpeakerHighIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui-provider";
import { MobileSettingsNav } from "./mobile/mobile-settings-nav";
import { type SettingsTabItem, SettingsTabs } from "./settings-tabs";

type SettingsContainerProps = {
  children: React.ReactNode;
  className?: string;
};

// 6 flat main tabs
const mainTabs: SettingsTabItem[] = [
  { path: ROUTES.SETTINGS.GENERAL, label: "General", icon: GearIcon },
  { path: ROUTES.SETTINGS.PERSONAS, label: "Personas", icon: UsersIcon },
  { path: ROUTES.SETTINGS.MEMORY, label: "Memory", icon: BrainIcon },
  {
    path: ROUTES.SETTINGS.TEXT_MODELS,
    label: "Models",
    icon: RobotIcon,
  },
  {
    path: ROUTES.SETTINGS.HISTORY,
    label: "History",
    icon: ClockIcon,
  },
  { path: ROUTES.SETTINGS.FILES, label: "Files", icon: PaperclipIcon },
];

// Sub-tabs only for Models
const modelSubTabs: SettingsTabItem[] = [
  { path: ROUTES.SETTINGS.TEXT_MODELS, label: "Text", icon: ChatTextIcon },
  { path: ROUTES.SETTINGS.IMAGE_MODELS, label: "Image", icon: ImageIcon },
  { path: ROUTES.SETTINGS.TTS_MODELS, label: "TTS", icon: SpeakerHighIcon },
  { path: ROUTES.SETTINGS.API_KEYS, label: "Keys", icon: KeyIcon },
];

function getActiveSubTabs(pathname: string): SettingsTabItem[] | null {
  if (pathname.startsWith("/settings/models")) {
    return modelSubTabs;
  }
  return null;
}

export const SettingsContainer = ({
  children,
  className = "",
}: SettingsContainerProps) => {
  const location = useLocation();
  const { isMobile } = useUI();

  const activeSubTabs = getActiveSubTabs(location.pathname);

  // Determine active main tab index
  const activeMainIndex = useMemo(() => {
    // Models group: any /settings/models/* path
    if (location.pathname.startsWith("/settings/models")) {
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

  // Determine active sub-tab index
  const activeSubIndex = useMemo(() => {
    if (!activeSubTabs) {
      return 0;
    }
    const index = activeSubTabs.findIndex(
      tab => location.pathname === tab.path
    );
    return index !== -1 ? index : 0;
  }, [activeSubTabs, location.pathname]);

  // On mobile, use the swipeable carousel navigation
  if (isMobile) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 min-h-0 px-4 pt-6 flex flex-col">
        <MobileSettingsNav />
      </div>
    );
  }

  // Desktop: Window handles scrolling, nav is sticky at top
  return (
    <div className="flex-1">
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

          {/* Sub-navigation */}
          {activeSubTabs && (
            <nav>
              <SettingsTabs
                tabs={activeSubTabs}
                activeIndex={activeSubIndex}
                layoutId="settings-sub-tab"
              />
            </nav>
          )}
        </div>
      </div>

      {/* Content area - scrolls with window */}
      <div className="mx-auto w-full max-w-4xl px-4 pt-4 pb-10">
        <div className={cn("w-full", className)}>{children}</div>
      </div>
    </div>
  );
};
