import {
  ArchiveIcon,
  BrainIcon,
  CloudArrowDownIcon,
  GearIcon,
  KeyIcon,
  PaperclipIcon,
  RobotIcon,
  ShareNetworkIcon,
  UserCircleIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import useEmblaCarousel from "embla-carousel-react";
import { lazy, Suspense, useCallback } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useSettingsCarouselSync } from "@/hooks";
import { ROUTES } from "@/lib/routes";
import {
  ScrollContainerProvider,
  useSetScrollContainer,
} from "@/providers/scroll-container-context";
import {
  MobileSettingsTabs,
  type SettingsTabItem,
} from "./mobile-settings-tabs";

// Lazy load all settings pages
const GeneralPage = lazy(() => import("@/pages/settings/general-page"));
const ApiKeysTab = lazy(() =>
  import("@/components/settings/api-keys-tab").then(m => ({
    default: m.ApiKeysTab,
  }))
);
const ModelsTab = lazy(() =>
  import("@/components/settings/models-tab").then(m => ({
    default: m.ModelsTab,
  }))
);
const PersonasTab = lazy(() =>
  import("@/components/settings/personas-tab").then(m => ({
    default: m.PersonasTab,
  }))
);
const SharedConversationsPage = lazy(
  () => import("@/pages/settings/shared-conversations-page")
);
const ArchivedConversationsPage = lazy(
  () => import("@/pages/settings/archived-conversations-page")
);
const ChatHistoryPage = lazy(
  () => import("@/pages/settings/chat-history-page")
);
const AttachmentsPage = lazy(() => import("@/pages/settings/attachments-page"));
const MemoryPage = lazy(() => import("@/pages/settings/memory-page"));
const ProfilesPage = lazy(() => import("@/pages/settings/profiles-page"));

// Define settings routes with their components
const settingsRoutes: (SettingsTabItem & {
  component: React.LazyExoticComponent<React.ComponentType>;
})[] = [
  {
    path: ROUTES.SETTINGS.GENERAL,
    label: "General",
    icon: GearIcon,
    component: GeneralPage,
  },
  {
    path: ROUTES.SETTINGS.PROFILES,
    label: "Profiles",
    icon: UserCircleIcon,
    component: ProfilesPage,
  },
  {
    path: ROUTES.SETTINGS.API_KEYS,
    label: "API Keys",
    icon: KeyIcon,
    component: ApiKeysTab,
  },
  {
    path: ROUTES.SETTINGS.TEXT_MODELS,
    label: "Models",
    icon: RobotIcon,
    component: ModelsTab,
  },
  {
    path: ROUTES.SETTINGS.PERSONAS,
    label: "Personas",
    icon: UsersIcon,
    component: PersonasTab,
  },
  {
    path: ROUTES.SETTINGS.MEMORY,
    label: "Memory",
    icon: BrainIcon,
    component: MemoryPage,
  },
  {
    path: ROUTES.SETTINGS.SHARED_CONVERSATIONS,
    label: "Shares",
    icon: ShareNetworkIcon,
    component: SharedConversationsPage,
  },
  {
    path: ROUTES.SETTINGS.ARCHIVED_CONVERSATIONS,
    label: "Archive",
    icon: ArchiveIcon,
    component: ArchivedConversationsPage,
  },
  {
    path: ROUTES.SETTINGS.CHAT_HISTORY,
    label: "History",
    icon: CloudArrowDownIcon,
    component: ChatHistoryPage,
  },
  {
    path: ROUTES.SETTINGS.ATTACHMENTS,
    label: "Files",
    icon: PaperclipIcon,
    component: AttachmentsPage,
  },
];

// Extract just the tab items for the tab bar
const tabItems: SettingsTabItem[] = settingsRoutes.map(
  ({ path, label, icon }) => ({
    path,
    label,
    icon,
  })
);

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <Spinner />
    </div>
  );
}

// Slide wrapper that provides scroll container context
function SlideWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ScrollContainerProvider>
      <SlideContent>{children}</SlideContent>
    </ScrollContainerProvider>
  );
}

// Inner container that registers itself as the scroll container
function SlideContent({ children }: { children: React.ReactNode }) {
  const setScrollContainer = useSetScrollContainer();

  // Use callback ref to set scroll container synchronously on mount
  const callbackRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (setScrollContainer) {
        setScrollContainer(element);
      }
    },
    [setScrollContainer]
  );

  return (
    <div
      ref={callbackRef}
      data-scroll-container="true"
      className="relative min-w-0 shrink-0 grow-0 basis-full h-full overflow-y-auto px-4"
      style={{
        // Isolate from carousel transforms to prevent virtualization offset issues
        contain: "layout style",
        overflowAnchor: "none",
        // Ensure vertical scrolling works correctly within carousel
        touchAction: "pan-y",
        // Smooth iOS scrolling
        WebkitOverflowScrolling: "touch",
        // Force own compositing layer to isolate from parent transforms
        willChange: "scroll-position",
        // Ensure transform isolation
        transform: "translateZ(0)",
      }}
    >
      {children}
    </div>
  );
}

export function MobileSettingsNav() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: "x", // Explicitly set horizontal axis to avoid vertical scroll interference
    align: "start",
    loop: false,
    skipSnaps: false,
    containScroll: "trimSnaps",
    watchDrag: true,
  });

  const { currentIndex, scrollTo } = useSettingsCarouselSync(
    emblaApi,
    settingsRoutes
  );

  const handleTabClick = useCallback(
    (index: number) => {
      scrollTo(index);
    },
    [scrollTo]
  );

  // Determine which pages should be mounted (current + adjacent for smooth swiping)
  const shouldMountPage = useCallback(
    (index: number) => {
      return Math.abs(index - currentIndex) <= 1;
    },
    [currentIndex]
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* Scrollable Tab Bar */}
      <MobileSettingsTabs
        tabs={tabItems}
        activeIndex={currentIndex}
        onTabClick={handleTabClick}
      />

      {/* Swipeable Content */}
      <div ref={emblaRef} className="-mx-4 overflow-hidden flex-1 min-h-0">
        <div className="flex gap-6 h-full">
          {settingsRoutes.map((route, index) => {
            const PageComponent = route.component;
            const shouldMount = shouldMountPage(index);

            return (
              <SlideWrapper key={route.path}>
                {shouldMount ? (
                  <Suspense fallback={<PageLoader />}>
                    <PageComponent />
                  </Suspense>
                ) : (
                  <PageLoader />
                )}
              </SlideWrapper>
            );
          })}
        </div>
      </div>
    </div>
  );
}
