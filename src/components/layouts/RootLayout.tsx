import { Analytics } from "@vercel/analytics/react";
import { Outlet } from "react-router";

import { AppProvider } from "@/providers/app-provider";
import { OnlineStatus } from "../ui/online-status";
import { Toaster } from "../ui/sonner";
import { TooltipProvider } from "../ui/tooltip";

export default function RootLayout() {
  return (
    <AppProvider>
      <TooltipProvider>
        <Outlet />
        <Toaster />
        <Analytics />
        <OnlineStatus variant="floating" />
      </TooltipProvider>
    </AppProvider>
  );
}
