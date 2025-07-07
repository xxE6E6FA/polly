import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "@/routes.tsx";
import "@fontsource/geist-mono";
import "./globals.css";

const router = createBrowserRouter(routes);

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<RouterProvider router={router} />);
}
