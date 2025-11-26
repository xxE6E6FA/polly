import { lazy, Suspense } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { ProtectedSuspense } from "./components/auth/protected-route";
import ChatLayout from "./components/layouts/chat-layout";
import PersistentChatLayout from "./components/layouts/persistent-chat-layout";
import RootLayout from "./components/layouts/root-layout";
import { Spinner } from "./components/ui/spinner";

import HomePage from "./pages/home-page";
import PrivateChatPage from "./pages/private-chat-page";

const ChatConversationPage = lazy(
  () => import("./pages/chat-conversation-page")
);

const FavoritesPage = lazy(() => import("./pages/favorites-page"));

const AuthPage = lazy(() => import("./pages/auth-page"));

import { RouteErrorBoundary } from "./components/layouts/route-error-boundary";
// Prefer eager import for critical error/404 UI so offline navigation has a guard
import { NotFoundPage } from "./components/ui/not-found-page";
import { conversationLoader } from "./loaders/conversation-loader";

const SharePage = lazy(() => import("./pages/shared-conversation-page"));
const SettingsLayout = lazy(
  () => import("./components/layouts/settings-main-layout")
);
const SettingsStandaloneLayout = lazy(
  () => import("./components/layouts/settings-standalone-layout")
);
const SettingsApiKeysPage = lazy(() =>
  import("./components/settings/api-keys-tab").then(m => ({
    default: m.ApiKeysTab,
  }))
);
const SettingsModelsPage = lazy(() =>
  import("./components/settings/models-tab").then(m => ({
    default: m.ModelsTab,
  }))
);
const SettingsPersonasPage = lazy(() =>
  import("./components/settings/personas-tab").then(m => ({
    default: m.PersonasTab,
  }))
);
const SettingsSharedConversationsPage = lazy(
  () => import("./pages/settings/shared-conversations-page")
);
const SettingsArchivedConversationsPage = lazy(
  () => import("./pages/settings/archived-conversations-page")
);
const SettingsAttachmentsPage = lazy(
  () => import("./pages/settings/attachments-page")
);
const SettingsChatHistoryPage = lazy(
  () => import("./pages/settings/chat-history-page")
);
const SettingsGeneralPage = lazy(() => import("./pages/settings/general-page"));
const SettingsNewPersonaPage = lazy(
  () => import("./pages/settings/new-persona-page")
);
const SettingsEditPersonaPage = lazy(
  () => import("./pages/settings/edit-persona-page")
);
const SignOutPage = lazy(() => import("./pages/sign-out-page"));

const PageLoader = ({
  size = "full",
}: {
  size?: "full" | "partial" | "compact";
}) => {
  const sizeClasses = {
    full: "min-h-[100dvh]",
    partial: "min-h-[400px]",
    compact: "min-h-[200px]",
  };
  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <Spinner />
    </div>
  );
};

export const preloadSettings = () => {
  import("./components/layouts/settings-main-layout");
  import("./pages/settings/general-page");
};
export const preloadAuth = () => {
  import("./pages/auth-page");
};
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    errorElement: (
      <Suspense fallback={<PageLoader size="full" />}>
        <RouteErrorBoundary />
      </Suspense>
    ),
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "signout",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <SignOutPage />
          </Suspense>
        ),
      },
      {
        path: "auth",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <AuthPage />
          </Suspense>
        ),
      },
      {
        path: "private",
        element: <ChatLayout />,
        children: [
          {
            index: true,
            element: (
              <ProtectedSuspense fallback={<PageLoader size="full" />}>
                <PrivateChatPage />
              </ProtectedSuspense>
            ),
          },
        ],
      },
      {
        path: "chat",
        element: <PersistentChatLayout />,
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            path: ":conversationId",
            loader: conversationLoader,
            element: (
              <Suspense fallback={<PageLoader size="full" />}>
                <ChatConversationPage />
              </Suspense>
            ),
          },
          {
            path: "favorites",
            element: (
              <Suspense fallback={<PageLoader size="full" />}>
                <ProtectedSuspense fallback={<PageLoader size="full" />}>
                  <FavoritesPage />
                </ProtectedSuspense>
              </Suspense>
            ),
          },
        ],
      },

      {
        path: "share/:shareId",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <SharePage />
          </Suspense>
        ),
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
      },
      {
        path: "settings",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsLayout />
          </ProtectedSuspense>
        ),
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <Navigate to="/settings/general" replace />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "api-keys",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsApiKeysPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "models",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsModelsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
            children: [
              {
                index: true,
                element: <Navigate to="text" replace />,
              },
              {
                path: "text",
                element: <div />, // Empty element since content is handled by parent
              },
              {
                path: "image",
                element: <div />, // Empty element since content is handled by parent
              },
              {
                path: "tts",
                element: <div />, // Empty element since content is handled by parent
              },
            ],
          },
          {
            path: "personas",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsPersonasPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "shared-conversations",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsSharedConversationsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "archived-conversations",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsArchivedConversationsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "chat-history",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsChatHistoryPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "attachments",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsAttachmentsPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
          {
            path: "general",
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsGeneralPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: "settings/personas/new",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsStandaloneLayout />
          </ProtectedSuspense>
        ),
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsNewPersonaPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: "settings/personas/:id/edit",
        element: (
          <ProtectedSuspense fallback={<PageLoader size="full" />}>
            <SettingsStandaloneLayout />
          </ProtectedSuspense>
        ),
        errorElement: (
          <Suspense fallback={<PageLoader size="full" />}>
            <RouteErrorBoundary />
          </Suspense>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader size="partial" />}>
                <SettingsEditPersonaPage />
              </Suspense>
            ),
            errorElement: (
              <Suspense fallback={<PageLoader size="full" />}>
                <RouteErrorBoundary />
              </Suspense>
            ),
          },
        ],
      },
      {
        path: "*",
        element: (
          <Suspense fallback={<PageLoader size="full" />}>
            <NotFoundPage />
          </Suspense>
        ),
      },
    ],
  },
];
