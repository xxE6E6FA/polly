import type { useAnimation } from "framer-motion";

export type AnimatedIconProps = {
  controls: ReturnType<typeof useAnimation>;
  className?: string;
  "aria-hidden"?: boolean;
};
