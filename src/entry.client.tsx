import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { routes } from "@/routes.tsx";
import "@/globals.css";

const router = createBrowserRouter(routes);

// Centralized error handler for route errors (React Router 7.12+)
const handleRouteError = (error: unknown) => {
  // Log route errors for debugging and monitoring
  console.error("[Router Error]", error);

  // In production, you could send to an error tracking service:
  // if (import.meta.env.PROD) {
  //   errorTrackingService.captureException(error);
  // }
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <RouterProvider router={router} onError={handleRouteError} />
    </StrictMode>
  );
}

// Register service worker (production only)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore service worker registration errors
    });
  };
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
