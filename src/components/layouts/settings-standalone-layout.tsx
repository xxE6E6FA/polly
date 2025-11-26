import { Outlet } from "react-router-dom";

import { SettingsHeader } from "@/components/settings/settings-header";
import { ROUTES } from "@/lib/routes";

export default function SettingsStandaloneLayout() {
  return (
    <>
      <SettingsHeader
        backLink={ROUTES.SETTINGS.PERSONAS}
        backText="Back to Personas"
      />
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <Outlet />
      </div>
    </>
  );
}
