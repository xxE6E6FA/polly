import type { Transition } from "framer-motion";
import { motion } from "framer-motion";
import { cn } from "@/lib";
import type { AnimatedIconProps } from "./types";

const t: Transition = { type: "spring", stiffness: 160, damping: 17, mass: 1 };

export function AnimatedCopyIcon({
  controls,
  className,
  "aria-hidden": ariaHidden = true,
}: AnimatedIconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden={ariaHidden}
    >
      <motion.rect
        animate={controls}
        height="14"
        rx="2"
        ry="2"
        width="14"
        x="8"
        y="8"
        transition={t}
        variants={{
          normal: { translateY: 0, translateX: 0 },
          animate: { translateY: -3, translateX: -3 },
        }}
      />
      <motion.path
        animate={controls}
        d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
        transition={t}
        variants={{
          normal: { x: 0, y: 0 },
          animate: { x: 3, y: 3 },
        }}
      />
    </svg>
  );
}
