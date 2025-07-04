import { Sidebar } from "@/components/sidebar";
import { useChatVisualMode } from "@/hooks/use-chat-visual-mode";
import { cn } from "@/lib/utils";

type SharedChatLayoutProps = {
  children: React.ReactNode;
};

export const SharedChatLayout = ({ children }: SharedChatLayoutProps) => {
  const visualMode = useChatVisualMode();

  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main
        className={cn(
          "min-w-0 flex-1 overflow-hidden flex flex-col transition-all duration-700 ease-in-out",
          visualMode.isPrivateMode
            ? "bg-[radial-gradient(ellipse_800px_300px_at_bottom,rgba(147,51,234,0.06),transparent_70%)] dark:bg-[radial-gradient(ellipse_800px_300px_at_bottom,rgba(147,51,234,0.08),transparent_70%)]"
            : "bg-background"
        )}
      >
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
};
