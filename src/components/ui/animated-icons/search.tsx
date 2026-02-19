import { motion } from "framer-motion";
import { cn } from "@/lib";
import type { AnimatedIconProps } from "./types";

export function AnimatedSearchIcon({
  controls,
  className,
  "aria-hidden": ariaHidden = true,
}: AnimatedIconProps) {
  return (
    <motion.svg
      className={cn("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden={ariaHidden}
      animate={controls}
      variants={{
        normal: { x: 0, y: 0 },
        animate: {
          x: [0, 0, -3, 0],
          y: [0, -4, 0, 0],
        },
      }}
      transition={{ duration: 1, bounce: 0.3 }}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </motion.svg>
  );
}
