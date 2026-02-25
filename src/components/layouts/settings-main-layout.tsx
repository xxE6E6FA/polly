import { Outlet } from "react-router-dom";

import { SettingsContainer } from "@/components/settings/settings-container";
import { SettingsHeader } from "@/components/settings/settings-header";

export default function SettingsMainLayout() {
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <SettingsHeader backLink="/" backText="Back to Chat" />
      <SettingsContainer>
        <Outlet />
      </SettingsContainer>
    </div>
  );
}
