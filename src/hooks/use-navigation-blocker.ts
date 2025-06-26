import { useCallback, useEffect } from "react";

import { useBlocker } from "react-router";

type UseNavigationBlockerOptions = {
  when: boolean;
  message?: string;
};

export function useNavigationBlocker({
  when,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: UseNavigationBlockerOptions) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname
  );

  // Handle browser back/forward buttons and page refresh
  useEffect(() => {
    if (!when) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [when, message]);

  const confirmNavigation = useCallback(() => {
    if (blocker.state === "blocked") {
      const confirmed = window.confirm(message);
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker, message]);

  // Automatically show confirmation dialog when navigation is blocked
  useEffect(() => {
    if (blocker.state === "blocked") {
      confirmNavigation();
    }
  }, [blocker.state, confirmNavigation]);

  return {
    isBlocked: blocker.state === "blocked",
    blocker,
  };
}
