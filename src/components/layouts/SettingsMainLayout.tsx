import { Outlet } from "react-router";
import { SettingsContainer } from "@/components/settings/settings-container";
import { SettingsHeader } from "@/components/settings/settings-header";

export default function SettingsMainLayout() {
  return (
    <>
      <SettingsHeader backLink="/" backText="Back to Chat" />
      <SettingsContainer>
        <Outlet />
      </SettingsContainer>
    </>
  );
}
