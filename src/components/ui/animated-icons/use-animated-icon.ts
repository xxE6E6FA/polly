import { useAnimation } from "framer-motion";
import { useCallback } from "react";
import { useMediaQuery } from "@/hooks";

export function useAnimatedIcon() {
  const controls = useAnimation();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)"
  );

  const onHoverStart = useCallback(() => {
    if (!prefersReducedMotion) {
      controls.start("animate");
    }
  }, [controls, prefersReducedMotion]);

  const onHoverEnd = useCallback(() => {
    if (!prefersReducedMotion) {
      controls.start("normal");
    }
  }, [controls, prefersReducedMotion]);

  return { controls, onHoverStart, onHoverEnd };
}
