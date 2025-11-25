import type { EmblaCarouselType } from "embla-carousel";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type SettingsRoute = {
  path: string;
  label: string;
};

/**
 * Bidirectional sync between Embla carousel position and React Router URL.
 *
 * - When user swipes: carousel `onSelect` → navigate to new route
 * - When URL changes (browser back/forward): location change → scrollTo page
 * - Uses ref flag to prevent circular updates
 */
export function useSettingsCarouselSync(
  emblaApi: EmblaCarouselType | undefined,
  routes: SettingsRoute[]
) {
  const navigate = useNavigate();
  const location = useLocation();
  const isNavigatingRef = useRef(false);
  const lastIndexRef = useRef<number>(-1);

  // Find current index from URL
  const getCurrentIndex = useCallback(() => {
    const index = routes.findIndex(
      route =>
        location.pathname === route.path ||
        location.pathname.startsWith(`${route.path}/`)
    );
    return index !== -1 ? index : 0;
  }, [location.pathname, routes]);

  const currentIndex = getCurrentIndex();

  // Sync URL to carousel (for browser back/forward and direct URL navigation)
  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    const targetIndex = currentIndex;
    const currentSnap = emblaApi.selectedScrollSnap();

    // Only scroll if we're at a different position and not mid-navigation
    if (targetIndex !== currentSnap && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      emblaApi.scrollTo(targetIndex);

      // Reset flag after animation completes
      const timeout = setTimeout(() => {
        isNavigatingRef.current = false;
      }, 300);

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, emblaApi]);

  // Sync carousel to URL (for swipe navigation)
  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    const onSelect = () => {
      // Skip if this was triggered by URL change
      if (isNavigatingRef.current) {
        return;
      }

      const index = emblaApi.selectedScrollSnap();

      // Prevent duplicate navigations
      if (index === lastIndexRef.current) {
        return;
      }

      lastIndexRef.current = index;

      const targetRoute = routes[index];
      if (targetRoute && location.pathname !== targetRoute.path) {
        // Use replace to avoid polluting history during rapid swiping
        navigate(targetRoute.path, { replace: true });
      }
    };

    // Also handle settle event for more reliable navigation
    const onSettle = () => {
      isNavigatingRef.current = false;
    };

    emblaApi.on("select", onSelect);
    emblaApi.on("settle", onSettle);

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("settle", onSettle);
    };
  }, [emblaApi, navigate, routes, location.pathname]);

  return {
    currentIndex,
    scrollTo: useCallback(
      (index: number) => {
        if (emblaApi) {
          emblaApi.scrollTo(index);
        }
      },
      [emblaApi]
    ),
  };
}
