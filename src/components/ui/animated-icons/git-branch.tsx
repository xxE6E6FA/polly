import { motion } from "framer-motion";
import { cn } from "@/lib";
import type { AnimatedIconProps } from "./types";

const DURATION = 0.3;
const calcDelay = (i: number) => (i === 0 ? 0.1 : i * DURATION + 0.1);

export function AnimatedGitBranchIcon({
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
      <motion.circle
        animate={controls}
        cx="18"
        cy="6"
        r="3"
        transition={{
          duration: DURATION,
          delay: calcDelay(0),
          opacity: { delay: calcDelay(0) },
        }}
        variants={{
          normal: {
            pathLength: 1,
            opacity: 1,
            transition: { delay: 0 },
          },
          animate: { pathLength: [0, 1], opacity: [0, 1] },
        }}
      />
      <motion.line
        animate={controls}
        x1="6"
        x2="6"
        y1="3"
        y2="15"
        transition={{
          duration: DURATION,
          delay: calcDelay(1),
          opacity: { delay: calcDelay(1) },
        }}
        variants={{
          normal: {
            pathLength: 1,
            pathOffset: 0,
            opacity: 1,
            transition: { delay: 0 },
          },
          animate: {
            pathLength: [0, 1],
            opacity: [0, 1],
            pathOffset: [1, 0],
          },
        }}
      />
      <motion.circle
        animate={controls}
        cx="6"
        cy="18"
        r="3"
        transition={{
          duration: DURATION,
          delay: calcDelay(2),
          opacity: { delay: calcDelay(2) },
        }}
        variants={{
          normal: {
            pathLength: 1,
            opacity: 1,
            transition: { delay: 0 },
          },
          animate: { pathLength: [0, 1], opacity: [0, 1] },
        }}
      />
      <motion.path
        animate={controls}
        d="M18 9a9 9 0 0 1-9 9"
        transition={{
          duration: DURATION,
          delay: calcDelay(1),
          opacity: { delay: calcDelay(1) },
        }}
        variants={{
          normal: {
            pathLength: 1,
            pathOffset: 0,
            opacity: 1,
            transition: { delay: 0 },
          },
          animate: {
            pathLength: [0, 1],
            opacity: [0, 1],
            pathOffset: [1, 0],
          },
        }}
      />
    </svg>
  );
}
