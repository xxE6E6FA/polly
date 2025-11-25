import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type SettingsTabItem = {
  path: string;
  label: string;
  icon: PhosphorIcon;
};

type MobileSettingsTabsProps = {
  tabs: SettingsTabItem[];
  activeIndex: number;
  onTabClick: (index: number) => void;
};

export function MobileSettingsTabs({
  tabs,
  activeIndex,
  onTabClick,
}: MobileSettingsTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  return (
    <div
      ref={containerRef}
      className="-mx-4 overflow-x-auto px-4 scrollbar-hide"
    >
      <div className="relative flex w-max min-w-full gap-1 rounded-lg bg-muted/60 p-1 shadow-sm ring-1 ring-border/30">
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = index === activeIndex;

          return (
            <button
              key={tab.path}
              ref={el => {
                tabRefs.current[index] = el;
              }}
              type="button"
              onClick={() => onTabClick(index)}
              className={cn(
                "relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="settings-tab-pill"
                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                  style={{ borderRadius: 6 }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <Icon className="relative z-10 h-4 w-4 shrink-0" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
