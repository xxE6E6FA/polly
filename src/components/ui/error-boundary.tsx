import React from "react";
import { Button } from "./button";
import {
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  CopyIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  showDetails: boolean;
  copied: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

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
      const storedTheme = localStorage.getItem("theme") as
        | "light"
        | "dark"
        | null;
      if (storedTheme && (storedTheme === "light" || storedTheme === "dark")) {
        // Apply stored theme to HTML element
        const htmlElement = document.documentElement;
        htmlElement.classList.remove("light", "dark");
        htmlElement.classList.add(storedTheme);
      }
    } catch (error) {
      console.error("Error reading theme from localStorage:", error);
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
    if (!this.state.error) return;

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
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <div className="flex flex-col items-center text-center space-y-6 p-8 bg-background/50 backdrop-blur-sm rounded-xl">
              <img
                src="/polly-404.png"
                alt="Polly looking confused"
                className="w-32 h-32 object-contain animate-in fade-in-0 zoom-in-95 duration-500"
              />

              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                  Oops! Something went wrong
                </h1>
                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                  {this.state.hasError
                    ? "Polly encountered an unexpected error."
                    : "Polly couldn't load the application."}
                </p>
              </div>

              <Button
                onClick={() => window.location.reload()}
                size="lg"
                className="gap-2"
              >
                <ArrowCounterClockwiseIcon className="h-4 w-4" />
                Reload page
              </Button>

              {this.state.error && (
                <div className="w-full mt-8">
                  <button
                    onClick={this.toggleDetails}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2 px-4",
                      "text-sm font-medium text-muted-foreground",
                      "hover:text-foreground transition-colors",
                      "rounded-lg hover:bg-muted/50"
                    )}
                  >
                    <span>Error details</span>
                    {this.state.showDetails ? (
                      <CaretUpIcon className="h-4 w-4" />
                    ) : (
                      <CaretDownIcon className="h-4 w-4" />
                    )}
                  </button>

                  {this.state.showDetails && (
                    <div className="mt-4 animate-in slide-in-from-top-2 fade-in-0 duration-200">
                      <div className="rounded-lg border bg-muted/30 text-left relative">
                        <Button
                          onClick={this.copyErrorDetails}
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 z-10"
                        >
                          {this.state.copied ? (
                            <>
                              <CheckIcon className="h-4 w-4 mr-2" />
                              Copied
                            </>
                          ) : (
                            <>
                              <CopyIcon className="h-4 w-4 mr-2" />
                              Copy
                            </>
                          )}
                        </Button>
                        <div className="max-h-64 overflow-y-auto p-4">
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words pr-20">
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
