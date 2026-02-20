"use client";

import { motion, type Variants } from "motion/react";
import * as React from "react";

import {
  getVariants,
  type IconProps,
  IconWrapper,
  useAnimateIconContext,
} from "@/components/animate-ui/icons/icon";

type ALargeSmallProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    large: {
      initial: { scale: 1, y: 0 },
      animate: {
        scale: [1, 1.2, 1],
        y: [0, -2, 0],
        transition: { duration: 0.45, ease: "easeInOut" },
      },
    },
    largeCrossbar: {
      initial: { scale: 1, y: 0 },
      animate: {
        scale: [1, 1.2, 1],
        y: [0, -2, 0],
        transition: { duration: 0.45, ease: "easeInOut" },
      },
    },
    small: {
      initial: { scale: 1, y: 0 },
      animate: {
        scale: [1, 0.8, 1],
        y: [0, 2, 0],
        transition: { duration: 0.45, ease: "easeInOut", delay: 0.08 },
      },
    },
    smallCrossbar: {
      initial: { scale: 1, y: 0 },
      animate: {
        scale: [1, 0.8, 1],
        y: [0, 2, 0],
        transition: { duration: 0.45, ease: "easeInOut", delay: 0.08 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ALargeSmallProps) {
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
      {/* Large "A" */}
      <motion.path
        d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"
        variants={variants.large}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M3.304 13h6.392"
        variants={variants.largeCrossbar}
        initial="initial"
        animate={controls}
      />
      {/* Small "a" */}
      <motion.path
        d="m15 16 2.536-7.328a1.02 1.02 0 0 1 1.928 0L22 16"
        variants={variants.small}
        initial="initial"
        animate={controls}
      />
      <motion.path
        d="M15.697 14h5.606"
        variants={variants.smallCrossbar}
        initial="initial"
        animate={controls}
      />
    </motion.svg>
  );
}

function ALargeSmall(props: ALargeSmallProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ALargeSmall,
  ALargeSmall as ALargeSmallIcon,
  type ALargeSmallProps,
  type ALargeSmallProps as ALargeSmallIconProps,
};
