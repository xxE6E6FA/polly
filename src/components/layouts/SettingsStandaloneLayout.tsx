import { Outlet } from "react-router";

import { SettingsHeader } from "@/components/settings/settings-header";

export default function SettingsStandaloneLayout() {
  return (
    <>
      <SettingsHeader
        backLink="/settings/personas"
        backText="Back to Personas"
      />
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <Outlet />
      </div>
    </>
  );
}
