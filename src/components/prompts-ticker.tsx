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

interface PromptsProps {
  onQuickPrompt: (prompt: string) => void;
  hasReachedLimit?: boolean;
  className?: string;
  hasWarning?: boolean;
}

export function SimplePrompts({
  onQuickPrompt,
  hasReachedLimit = false,
  className,
  hasWarning = false,
}: PromptsProps) {
  // Select 4 random prompts, but keep them stable during the component lifecycle
  const selectedPrompts = useMemo(() => {
    const shuffled = [...allPrompts].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4);
  }, []);

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
                type="button"
                className={cn(
                  "group relative text-left px-3 py-2 rounded-lg text-xs transition-all duration-200",
                  "bg-muted/20 hover:bg-muted/40 border border-border/30 hover:border-border/50",
                  "hover:shadow-sm",
                  hasReachedLimit &&
                    "opacity-50 cursor-not-allowed hover:bg-muted/20 hover:border-border/30 hover:shadow-none",
                  "animate-fade-in-up"
                )}
                style={{
                  animationDelay: `${index * 100}ms`,
                  animationFillMode: "backwards",
                }}
                onClick={() => !hasReachedLimit && onQuickPrompt(prompt)}
                disabled={hasReachedLimit}
              >
                <span className="text-foreground/60 group-hover:text-foreground/80 line-clamp-2 leading-snug">
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
        <div className="max-w-3xl mx-auto">
          <div className="px-3 sm:px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedPrompts.map((prompt, index) => (
                <button
                  key={prompt}
                  type="button"
                  className={cn(
                    "group relative text-left px-3 py-2 rounded-lg text-xs transition-all duration-200",
                    "bg-muted/20 hover:bg-muted/40 border border-border/30 hover:border-border/50",
                    "hover:shadow-sm",
                    hasReachedLimit &&
                      "opacity-50 cursor-not-allowed hover:bg-muted/20 hover:border-border/30 hover:shadow-none",
                    "animate-fade-in-up"
                  )}
                  style={{
                    animationDelay: `${index * 100}ms`,
                    animationFillMode: "backwards",
                  }}
                  onClick={() => !hasReachedLimit && onQuickPrompt(prompt)}
                  disabled={hasReachedLimit}
                >
                  <span className="text-foreground/60 group-hover:text-foreground/80 line-clamp-2 leading-snug">
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
}

export function PromptsTickerWrapper({
  onQuickPrompt,
  hasReachedLimit = false,
  isAnonymous,
  userLoading,
  className,
  hasWarning = false,
}: {
  onQuickPrompt: (prompt: string) => void;
  hasReachedLimit?: boolean;
  remainingMessages?: number;
  isAnonymous: boolean;
  userLoading: boolean;
  className?: string;
  hasWarning?: boolean;
}) {
  // Don't render anything until we know the user state
  if (userLoading) {
    return null;
  }

  // Only show for anonymous users
  if (!isAnonymous) {
    return null;
  }

  return (
    <SimplePrompts
      onQuickPrompt={onQuickPrompt}
      hasReachedLimit={hasReachedLimit}
      className={className}
      hasWarning={hasWarning}
    />
  );
}
