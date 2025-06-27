import { type ReactNode } from "react";

import { PushPinIcon } from "@phosphor-icons/react";

type ConversationGroupProps = {
  title: string;
  children: ReactNode;
};

export const ConversationGroup = ({
  title,
  children,
}: ConversationGroupProps) => {
  return (
    <div className="space-y-1">
      <h3 className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-foreground/70 flex items-center gap-1">
        {title === "Pinned" && (
          <PushPinIcon className="h-3.5 w-3.5" weight="fill" />
        )}
        <span>{title}</span>
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
};
