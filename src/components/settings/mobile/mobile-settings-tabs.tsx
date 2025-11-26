import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { SettingsTabs } from "../settings-tabs";

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
  return (
    <SettingsTabs
      tabs={tabs}
      activeIndex={activeIndex}
      onTabClick={onTabClick}
    />
  );
}
