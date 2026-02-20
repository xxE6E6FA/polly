"use client";

import { motion, type Variants } from "motion/react";
import * as React from "react";

import {
  getVariants,
  type IconProps,
  IconWrapper,
  useAnimateIconContext,
} from "@/components/animate-ui/icons/icon";

type GitBranchProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    path: {
      initial: { pathLength: 1, pathOffset: 0 },
      animate: {
        pathLength: [1, 0.5, 1],
        pathOffset: [0, 0.2, 0],
        transition: { duration: 0.6, ease: "easeInOut" },
      },
    },
    topCircle: {
      initial: { scale: 1 },
      animate: {
        scale: [1, 1.3, 1],
        transition: { duration: 0.4, ease: "easeInOut", delay: 0.15 },
      },
    },
    bottomCircle: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: GitBranchProps) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.path
        d="M15 6a9 9 0 0 0-9 9V3"
        variants={variants.path}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx="18"
        cy="6"
        r="3"
        variants={variants.topCircle}
        initial="initial"
        animate={controls}
      />
      <motion.circle
        cx="6"
        cy="18"
        r="3"
        variants={variants.bottomCircle}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function GitBranch(props: GitBranchProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  GitBranch,
  GitBranch as GitBranchIcon,
  type GitBranchProps,
  type GitBranchProps as GitBranchIconProps,
};
