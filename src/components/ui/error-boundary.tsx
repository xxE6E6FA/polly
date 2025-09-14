import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  CopyIcon,
} from "@phosphor-icons/react";
import React from "react";
import { OfflinePlaceholder } from "@/components/ui/offline-placeholder";
import { CACHE_KEYS, get as getLS } from "@/lib/local-storage";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  showDetails: boolean;
  copied: boolean;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  componentDidMount() {
    // Ensure theme is applied from localStorage
    this.applyThemeFromLocalStorage();
  }

  applyThemeFromLocalStorage = () => {
    try {
      const storedTheme = getLS<"light" | "dark">(CACHE_KEYS.theme, "light");

      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(storedTheme);
    } catch (error) {
      console.error("Error reading theme from storage:", error);
    }
  };

  resetError = () => {
    this.setState({
      hasError: false,
      error: undefined,
      showDetails: false,
      copied: false,
    });
  };

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails, copied: false }));
  };

  copyErrorDetails = () => {
    if (!this.state.error) {
      return;
    }

    const errorText = `${this.state.error.name || "Error"}: ${this.state.error.message || "Unknown error"}${
      this.state.error.stack ? `\n\n${this.state.error.stack}` : ""
    }`;

    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (isOffline) {
        return (
          <OfflinePlaceholder
            title="You're offline"
            description="Reconnect and reload the page to continue."
            onRetry={() => window.location.reload()}
          />
        );
      }
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent
            error={this.state.error}
            resetError={this.resetError}
          />
        );
      }

      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <div className="flex flex-col items-center stack-xl rounded-xl bg-background/50 p-8 text-center backdrop-blur-sm">
              <img
                alt="Polly looking confused"
                className="h-32 w-32 object-contain duration-500 animate-in fade-in-0 zoom-in-95"
                src="/polly-404.png"
                onError={e => {
                  // Hide broken image when offline in dev/preview
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />

              <div className="stack-sm">
                <h1 className="text-3xl font-bold text-foreground">
                  Oops! Something went wrong
                </h1>
                <p className="mx-auto max-w-md text-lg text-muted-foreground">
                  {this.state.hasError
                    ? "Polly encountered an unexpected error."
                    : "Polly couldn't load the application."}
                </p>
              </div>

              <Button
                className="gap-2"
                size="lg"
                onClick={() => window.location.reload()}
              >
                <ArrowCounterClockwiseIcon className="h-4 w-4" />
                Reload page
              </Button>

              {this.state.error && (
                <div className="mt-8 w-full">
                  <button
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2 px-4",
                      "text-sm font-medium text-muted-foreground",
                      "hover:text-foreground transition-colors",
                      "rounded-lg hover:bg-muted/50"
                    )}
                    onClick={this.toggleDetails}
                  >
                    <span>Error details</span>
                    {this.state.showDetails ? (
                      <CaretUpIcon className="h-4 w-4" />
                    ) : (
                      <CaretDownIcon className="h-4 w-4" />
                    )}
                  </button>

                  {this.state.showDetails && (
                    <div className="mt-4 duration-200 animate-in fade-in-0 slide-in-from-top-2">
                      <div className="relative rounded-lg border bg-muted/30 text-left">
                        <Button
                          className="absolute right-2 top-2 z-10"
                          size="sm"
                          variant="ghost"
                          onClick={this.copyErrorDetails}
                        >
                          {this.state.copied ? (
                            <>
                              <CheckIcon className="mr-2 h-4 w-4" />
                              Copied
                            </>
                          ) : (
                            <>
                              <CopyIcon className="mr-2 h-4 w-4" />
                              Copy
                            </>
                          )}
                        </Button>
                        <div className="max-h-64 overflow-y-auto p-4">
                          <pre className="whitespace-pre-wrap break-words pr-20 text-xs text-muted-foreground">
                            <span className="font-semibold text-destructive">
                              {this.state.error.name || "Error"}:
                            </span>{" "}
                            {this.state.error.message || "Unknown error"}
                            {this.state.error.stack && (
                              <>
                                {"\n\n"}
                                <span className="opacity-70">
                                  {this.state.error.stack}
                                </span>
                              </>
                            )}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
