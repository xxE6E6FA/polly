const SIDEBAR_STORAGE_KEY = "sidebar-visible";

export function setSidebarStorage(isVisible: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(isVisible));
    window.dispatchEvent(new CustomEvent("sidebar-visibility-changed"));
  } catch (error) {
    console.error("Failed to save sidebar preference:", error);
  }
}

export function getSidebarFromStorage(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === null) {
      return null;
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error("Failed to load sidebar preference:", error);
    return null;
  }
}

export function getDefaultSidebarState(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  // Desktop: show sidebar by default
  // Mobile: hide sidebar by default
  const isMobile = window.innerWidth < 768;
  return !isMobile;
}
