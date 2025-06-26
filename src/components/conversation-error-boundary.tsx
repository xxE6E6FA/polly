import React from "react";

type ConversationErrorBoundaryState = {
  hasError: boolean;
};

type ConversationErrorBoundaryProps = {
  children: React.ReactNode;
};

export class ConversationErrorBoundary extends React.Component<
  ConversationErrorBoundaryProps,
  ConversationErrorBoundaryState
> {
  constructor(props: ConversationErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ConversationErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Conversation page error:", error);

    // If it's a Convex validation error or similar, treat as not found
    if (
      error.message.includes("ArgumentValidationError") ||
      error.message.includes("Value does not match validator") ||
      error.message.includes("v.id(")
    ) {
      // Redirect to not found page
      window.location.href = "/404";
    }
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI for other types of errors
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
            <p className="mb-4 text-muted-foreground">
              Unable to load this conversation.
            </p>
            <button
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = "/";
              }}
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
