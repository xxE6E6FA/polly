import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChatInputContainerProps {
  children: ReactNode;
  className?: string;
  isDragOver: boolean;
  canSend: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export function ChatInputContainer({
  children,
  className,
  isDragOver,
  canSend,
  onDragOver,
  onDragLeave,
  onDrop,
}: ChatInputContainerProps) {
  return (
    <div className="mx-auto w-full max-w-3xl chat-input-footer-backdrop">
      <div
        className={cn(
          "relative chat-input-container outline-none",
          className,
          isDragOver && canSend && "ring-2 ring-primary/50 bg-primary/5"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isDragOver && canSend && (
          <div className="absolute inset-0 z-chat-input flex items-center justify-center bg-primary/10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-primary">
              <svg
                className="h-8 w-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm font-medium">Drop files to upload</p>
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
