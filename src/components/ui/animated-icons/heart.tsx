import { motion } from "framer-motion";
import { cn } from "@/lib";
import type { AnimatedIconProps } from "./types";

type AnimatedHeartIconProps = AnimatedIconProps & {
  filled?: boolean;
};

export function AnimatedHeartIcon({
  controls,
  className,
  filled = false,
  "aria-hidden": ariaHidden = true,
}: AnimatedHeartIconProps) {
  return (
    <motion.svg
      className={cn("shrink-0", className)}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden={ariaHidden}
      animate={controls}
      variants={{
        normal: { scale: 1 },
        animate: { scale: [1, 1.08, 1] },
      }}
      transition={{ duration: 0.45, repeat: 2 }}
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </motion.svg>
  );
}
