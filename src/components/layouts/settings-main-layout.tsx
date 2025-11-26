import { Outlet } from "react-router-dom";

import { SettingsContainer } from "@/components/settings/settings-container";
import { SettingsHeader } from "@/components/settings/settings-header";

export default function SettingsMainLayout() {
  return (
    <div className="flex flex-col h-[100dvh]">
      <SettingsHeader backLink="/" backText="Back to Chat" />
      <SettingsContainer>
        <Outlet />
      </SettingsContainer>
    </div>
  );
}
