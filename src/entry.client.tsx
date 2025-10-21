import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "@/routes.tsx";
import "./globals.css";

const router = createBrowserRouter(routes);

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
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
