import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

type QueryProviderProps = {
  children: React.ReactNode;
};

export const QueryProvider = ({ children }: QueryProviderProps) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000, // 10 minutes
            retry: (failureCount, error) => {
              // Don't retry on certain error types
              if (error instanceof Error) {
                // Don't retry on authentication errors
                if (
                  error.message.includes("Unauthorized") ||
                  error.message.includes("401")
                ) {
                  return false;
                }
                // Don't retry on validation errors
                if (
                  error.message.includes("400") ||
                  error.message.includes("Bad Request")
                ) {
                  return false;
                }
              }
              // Retry up to 3 times for other errors
              return failureCount < 3;
            },
            retryDelay: attemptIndex =>
              Math.min(1000 * 2 ** attemptIndex, 30000),
            refetchOnWindowFocus: false, // Disable refetch on window focus for better UX
            refetchOnReconnect: true, // Refetch when network reconnects
          },
          mutations: {
            retry: (failureCount, error) => {
              // Generally don't retry mutations to avoid duplicate operations
              if (error instanceof Error) {
                // Only retry on network errors
                if (
                  error.message.includes("network") ||
                  error.message.includes("timeout")
                ) {
                  return failureCount < 1; // Only retry once for mutations
                }
              }
              return false;
            },
            onError: error => {
              console.error("Mutation error:", error);
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
