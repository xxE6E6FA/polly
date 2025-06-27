export const ROUTES = {
  HOME: "/",
  AUTH: "/auth",
  AUTH_CALLBACK: "/auth/callback",
  CHAT: "/chat",
  CHAT_CONVERSATION: (conversationId: string) => `/chat/${conversationId}`,
  SHARE: (shareId: string) => `/share/${shareId}`,
  SETTINGS: {
    ROOT: "/settings",
    API_KEYS: "/settings/api-keys",
    MODELS: "/settings/models",
    PERSONAS: "/settings/personas",
    PERSONAS_NEW: "/settings/personas/new",
    PERSONAS_EDIT: (id: string) => `/settings/personas/${id}/edit`,
    SHARED_CONVERSATIONS: "/settings/shared-conversations",
    ABOUT: "/settings/about",
  },
  NOT_FOUND: "/404",
} as const;

export type RouteParams = {
  conversationId?: string;
  shareId?: string;
  id?: string;
};
