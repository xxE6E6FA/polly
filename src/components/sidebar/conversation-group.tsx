import { ReactNode } from "react";

interface ConversationGroupProps {
  title: string;
  children: ReactNode;
}

export function ConversationGroup({ title, children }: ConversationGroupProps) {
  return (
    <div className="space-y-1">
      <h3 className="font-medium text-foreground/70 text-xs uppercase tracking-wider px-3 py-1.5">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
