import { type ReactNode, useEffect } from "react";
import { usePrivateMode } from "@/providers/private-mode-context";

/**
 * Route-level wrapper that activates or deactivates private mode.
 * Wrap page elements with this in routes.tsx so individual pages
 * don't need to manage private mode state themselves.
 */
export function PrivateModeRoute({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const { setPrivateMode } = usePrivateMode();

  useEffect(() => {
    setPrivateMode(enabled);
    return () => {
      if (enabled) {
        setPrivateMode(false);
      }
    };
  }, [enabled, setPrivateMode]);

  return <>{children}</>;
}
