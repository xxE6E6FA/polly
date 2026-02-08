import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type SettingsTabItem = {
  path: string;
  label: string;
  icon: PhosphorIcon;
};

type SettingsTabsProps = {
  tabs: SettingsTabItem[];
  activeIndex: number;
  /** For mobile carousel mode - clicking triggers callback instead of navigation */
  onTabClick?: (index: number) => void;
  /** Unique ID for framer-motion layoutId (prevents conflicts with multiple tab bars) */
  layoutId?: string;
};

export function SettingsTabs({
  tabs,
  activeIndex,
  onTabClick,
  layoutId = "settings-tab-pill",
}: SettingsTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
  const [showLeftMask, setShowLeftMask] = useState(false);
  const [showRightMask, setShowRightMask] = useState(false);

  // Check scroll position to determine which masks to show
  const updateMasks = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const threshold = 10;

    setShowLeftMask(scrollLeft > threshold);
    setShowRightMask(scrollLeft < scrollWidth - clientWidth - threshold);
  }, []);

  // Auto-scroll active tab into view
  useEffect(() => {
    const activeTab = tabRefs.current[activeIndex];
    if (activeTab) {
      activeTab.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIndex]);

  // Set up scroll listener and initial mask state
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    updateMasks();
    el.addEventListener("scroll", updateMasks, { passive: true });

    // Also update on resize
    const resizeObserver = new ResizeObserver(updateMasks);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateMasks);
      resizeObserver.disconnect();
    };
  }, [updateMasks]);

  // Determine mask gradient based on which edges need fading
  const getMaskStyle = () => {
    if (showLeftMask && showRightMask) {
      return {
        maskImage:
          "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)",
      };
    }
    if (showLeftMask) {
      return {
        maskImage: "linear-gradient(to right, transparent, black 24px)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 24px)",
      };
    }
    if (showRightMask) {
      return {
        maskImage: "linear-gradient(to left, transparent, black 24px)",
        WebkitMaskImage: "linear-gradient(to left, transparent, black 24px)",
      };
    }
    return {};
  };

  return (
    <div ref={containerRef} className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-hide"
        style={getMaskStyle()}
      >
        <div className="relative flex w-max min-w-full gap-1 overflow-hidden rounded-lg bg-muted/60 p-1 shadow-sm ring-1 ring-border/30 sm:w-full">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = index === activeIndex;

            const tabContent = (
              <>
                {isActive && (
                  <motion.span
                    layoutId={layoutId}
                    className="absolute inset-0 rounded-md bg-background shadow-sm"
                    style={{ borderRadius: 6 }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <Icon className="relative z-10 size-4 shrink-0" />
                <span className="relative z-10">{tab.label}</span>
              </>
            );

            const tabClassName = cn(
              "relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted",
              "sm:flex-1",
              isActive ? "text-foreground" : "text-muted-foreground"
            );

            // Mobile mode: use button with callback
            if (onTabClick) {
              return (
                <button
                  key={tab.path}
                  ref={el => {
                    tabRefs.current[index] = el;
                  }}
                  type="button"
                  onClick={() => onTabClick(index)}
                  className={tabClassName}
                >
                  {tabContent}
                </button>
              );
            }

            // Desktop mode: use Link for navigation
            return (
              <Link
                key={tab.path}
                ref={el => {
                  tabRefs.current[index] = el;
                }}
                to={tab.path}
                className={tabClassName}
              >
                {tabContent}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
