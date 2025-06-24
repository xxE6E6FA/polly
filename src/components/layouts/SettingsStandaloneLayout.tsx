import { Outlet } from "react-router";
import { SettingsHeader } from "@/components/settings/settings-header";

export default function SettingsStandaloneLayout() {
  return (
    <>
      <SettingsHeader
        backLink="/settings/personas"
        backText="Back to Personas"
      />
      <div className="max-w-4xl mx-auto px-6 py-8 w-full flex-1">
        <Outlet />
      </div>
    </>
  );
}
