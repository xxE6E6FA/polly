import { useEffect, useRef, useState, useTransition } from "react";
import { Sidebar } from "@/components/sidebar";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { cn } from "@/lib/utils";

type SharedChatLayoutProps = {
  children: React.ReactNode;
};

export const SharedChatLayout = ({ children }: SharedChatLayoutProps) => {
  const { isPrivateMode } = usePrivateMode();
  const [isExiting, setIsExiting] = useState(false);
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevPrivateMode = useRef(isPrivateMode);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle private mode transitions
  useEffect(() => {
    // Only trigger exit animation when transitioning from true to false
    if (prevPrivateMode.current && !isPrivateMode) {
      setIsExiting(true);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Use transition for smooth state updates
      startTransition(() => {
        timeoutRef.current = setTimeout(() => {
          setIsExiting(false);
          timeoutRef.current = null;
        }, 700); // Match the CSS animation duration
      });
    }

    // Update the ref for next comparison
    prevPrivateMode.current = isPrivateMode;
  }, [isPrivateMode]);

  // Show background when in private mode or during exit animation
  const showPrivateBackground = isPrivateMode || isExiting;

  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main
        className={cn(
          "min-w-0 flex-1 overflow-hidden flex flex-col transition-all duration-700 ease-in-out",
          showPrivateBackground && "private-mode-background",
          isExiting && "exiting"
        )}
      >
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
};
