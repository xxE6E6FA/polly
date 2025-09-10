import { useMemo } from "react";

import { cn } from "@/lib/utils";

const allPrompts = [
  "Why do parrots repeat everything?",
  "Write me a haiku about coffee",
  "Explain quantum physics like I'm five",
  "What makes a good password in 2025?",
  "How do I make friends as an adult?",
  "Teach me something surprising about octopuses",
  "Can you teach me a magic trick?",
  "Help me understand blockchain without the hype",
  "What actually happens when I clear cookies?",
  "Create a workout routine for someone who hates working out",
  "Tell me a fun fact that'll make me seem smart at parties",
  "What's the psychology behind why we love gossip?",
  "How do I become a morning person without dying?",
  "Why do we get songs stuck in our heads?",
  "What would aliens think of our social media?",
  "Is a hot dog a sandwich? Defend your answer",
  "Why does time feel like it goes faster as we age?",
  "How do I stop procrastinating right now?",
  "What's the best way to learn a new language?",
  "Why do cats purr and dogs don't?",
];

type PromptsProps = {
  onQuickPrompt: (prompt: string) => void;
  hasReachedLimit?: boolean;
  className?: string;
  hasWarning?: boolean;
  isAnonymous: boolean;
  userLoading: boolean;
};

export const SimplePrompts = ({
  onQuickPrompt,
  hasReachedLimit = false,
  className,
  hasWarning = false,
  isAnonymous,
  userLoading,
}: PromptsProps) => {
  // Select 4 random prompts, but keep them stable during the component lifecycle
  const selectedPrompts = useMemo(() => {
    const shuffled = [...allPrompts].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4);
  }, []);

  if (userLoading) {
    return null;
  }

  if (!isAnonymous) {
    return null;
  }

  return (
    <>
      {/* Mobile: Above input */}
      <div
        className={cn(
          "sm:hidden absolute bottom-full left-0 right-0 z-10 px-3",
          hasWarning ? "mb-12" : "mb-3",
          className
        )}
      >
        <div className="px-3">
          <div className="grid grid-cols-1 gap-2">
            {selectedPrompts.map((prompt, index) => (
              <button
                key={prompt}
                disabled={hasReachedLimit}
                type="button"
                className={cn(
                  "group relative text-left px-3 py-2 rounded-lg text-xs transition-all duration-200",
                  "bg-muted hover:bg-muted/80 border border-border hover:border-border",
                  "hover:shadow-sm",
                  hasReachedLimit &&
                    "opacity-50 cursor-not-allowed hover:bg-muted hover:border-border hover:shadow-none",
                  "animate-fade-in-up"
                )}
                style={{
                  animationDelay: `${index * 100}ms`,
                  animationFillMode: "backwards",
                }}
                onClick={() => !hasReachedLimit && onQuickPrompt(prompt)}
              >
                <span className="line-clamp-2 leading-snug text-foreground/60 group-hover:text-foreground/80">
                  {prompt}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: Below input */}
      <div
        className={cn(
          "hidden sm:block absolute top-full left-0 right-0 mt-3 z-10 px-3 sm:px-6",
          className
        )}
      >
        <div className="mx-auto max-w-3xl">
          <div className="px-3 sm:px-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {selectedPrompts.map((prompt, index) => (
                <button
                  key={prompt}
                  disabled={hasReachedLimit}
                  type="button"
                  className={cn(
                    "group relative text-left px-3 py-2 rounded-lg text-xs transition-all duration-200",
                    "bg-muted hover:bg-muted/80 border border-border hover:border-border",
                    "hover:shadow-sm",
                    hasReachedLimit &&
                      "opacity-50 cursor-not-allowed hover:bg-muted hover:border-border hover:shadow-none",
                    "animate-fade-in-up"
                  )}
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: "backwards",
                  }}
                  onClick={() => !hasReachedLimit && onQuickPrompt(prompt)}
                >
                  <span className="line-clamp-2 leading-snug text-foreground/80 group-hover:text-foreground">
                    {prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
