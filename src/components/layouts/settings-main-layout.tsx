import { Outlet, useLocation } from "react-router-dom";

import { SettingsContainer } from "@/components/settings/settings-container";
import { SettingsHeader } from "@/components/settings/settings-header";

export default function SettingsMainLayout() {
  const location = useLocation();

  return (
    <div className="flex h-[100dvh] flex-col animate-page-enter">
      <SettingsHeader backLink="/" backText="Back to Chat" />
      <SettingsContainer>
        <div key={location.pathname} className="animate-page-enter">
          <Outlet />
        </div>
      </SettingsContainer>
    </div>
  );
}
