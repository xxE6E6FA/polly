import type { Transition, Variants } from "framer-motion";
import { motion } from "framer-motion";
import { cn } from "@/lib";
import type { AnimatedIconProps } from "./types";

const t: Transition = { type: "spring", stiffness: 500, damping: 30 };

const lidVariants: Variants = {
  normal: { y: 0 },
  animate: { y: -1.1 },
};

export function AnimatedDeleteIcon({
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
      <motion.g animate={controls} variants={lidVariants} transition={t}>
        <path d="M3 6h18" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </motion.g>
      <motion.path
        animate={controls}
        d="M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8"
        transition={t}
        variants={{
          normal: { d: "M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8" },
          animate: { d: "M19 9v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V9" },
        }}
      />
      <motion.line
        animate={controls}
        x1="10"
        x2="10"
        y1="11"
        y2="17"
        transition={t}
        variants={{
          normal: { y1: 11, y2: 17 },
          animate: { y1: 11.5, y2: 17.5 },
        }}
      />
      <motion.line
        animate={controls}
        x1="14"
        x2="14"
        y1="11"
        y2="17"
        transition={t}
        variants={{
          normal: { y1: 11, y2: 17 },
          animate: { y1: 11.5, y2: 17.5 },
        }}
      />
    </svg>
  );
}
