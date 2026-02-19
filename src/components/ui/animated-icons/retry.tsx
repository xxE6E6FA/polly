import { motion } from "framer-motion";
import { cn } from "@/lib";
import type { AnimatedIconProps } from "./types";

export function AnimatedRetryIcon({
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
        normal: { rotate: 0 },
        animate: { rotate: -50 },
      }}
      transition={{ type: "spring", stiffness: 250, damping: 25 }}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </motion.svg>
  );
}
