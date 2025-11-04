import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Doc } from "@convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

let useMutationMock: ReturnType<typeof mock>;
let useQueryMock: ReturnType<typeof mock>;
let useUserSettingsMock: ReturnType<typeof mock>;
let useUserDataContextMock: ReturnType<typeof mock>;
let useToastMock: ReturnType<typeof mock>;

const personasApi = {
  list: mock(),
  listAllBuiltIn: mock(),
  remove: mock(),
  toggleBuiltInPersona: mock(),
};

const userSettingsApi = {
  getUserSettings: mock(),
  togglePersonasEnabled: mock(),
};

mock.module("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

mock.module("@convex/_generated/api", () => ({
  api: {
    personas: personasApi,
    userSettings: userSettingsApi,
  },
}));

mock.module("@/hooks/use-user-settings", () => ({
  useUserSettings: (...args: unknown[]) => useUserSettingsMock(...args),
}));

mock.module("@/providers/user-data-context", () => ({
  useUserDataContext: (...args: unknown[]) => useUserDataContextMock(...args),
}));

mock.module("@/providers/toast-context", () => ({
  useToast: (...args: unknown[]) => useToastMock(...args),
}));

mock.module("react-router-dom", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock must mirror export name */
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { api } from "@convex/_generated/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PersonasTab } from "./personas-tab";

type UseUserSettingsReturn = ReturnType<
  typeof import("@/hooks/use-user-settings").useUserSettings
>;
type UseUserDataContextReturn = ReturnType<
  typeof import("@/providers/user-data-context").useUserDataContext
>;
type UseToastReturn = ReturnType<
  typeof import("@/providers/toast-context").useToast
>;

describe("PersonasTab - Delete Confirmation", () => {
  const mockUser = {
    _id: "user-1",
  } as unknown as Doc<"users">;

  const mockPersona = {
    _id: "persona-1" as unknown as Doc<"personas">["_id"],
    name: "Test Persona",
    description: "A test persona",
    prompt: "You are a helpful assistant",
    icon: "??",
    isBuiltIn: false,
    userId: "user-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    _creationTime: Date.now(),
  } as unknown as Doc<"personas">;

  let mockRemovePersonaMutation: ReturnType<typeof mock>;

  beforeEach(() => {
    useMutationMock = mock();
    useQueryMock = mock();
    useUserSettingsMock = mock();
    useUserDataContextMock = mock();
    useToastMock = mock();
    mockRemovePersonaMutation = mock();

    personasApi.list.mockReset();
    personasApi.listAllBuiltIn.mockReset();
    personasApi.remove.mockReset();
    personasApi.toggleBuiltInPersona.mockReset();
    userSettingsApi.getUserSettings.mockReset();
    userSettingsApi.togglePersonasEnabled.mockReset();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mock((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: mock(),
        removeListener: mock(),
        addEventListener: mock(),
        removeEventListener: mock(),
        dispatchEvent: mock(),
      })),
    });

    useUserDataContextMock.mockReturnValue({
      user: mockUser,
    } as unknown as UseUserDataContextReturn);

    useUserSettingsMock.mockReturnValue({
      personasEnabled: true,
    } as unknown as UseUserSettingsReturn);

    useQueryMock.mockImplementation((query: unknown) => {
      if (query === api.personas.list) {
        return [mockPersona];
      }
      if (query === api.personas.listAllBuiltIn) {
        return [];
      }
      if (query === api.userSettings.getUserSettings) {
        return [];
      }
      return undefined;
    });

    useMutationMock.mockImplementation((mutation: unknown) => {
      if (mutation === api.personas.remove) {
        return mockRemovePersonaMutation;
      }
      return mock();
    });

    useToastMock.mockReturnValue({
      error: mock(),
      success: mock(),
      info: mock(),
    } as unknown as UseToastReturn);
  });

  const findDeleteButton = (container: HTMLElement) => {
    const buttons = container.querySelectorAll("button");
    return (
      Array.from(buttons).find(button => {
        const tooltipContent = button.closest('[role="tooltip"]')?.textContent;
        return tooltipContent?.includes("Delete persona");
      }) || container.querySelector('button[class*="destructive"]')
    );
  };

  test("opens confirmation dialog when delete button is clicked", async () => {
    const { container } = render(
      <TooltipProvider>
        <PersonasTab />
      </TooltipProvider>
    );

    const deleteButton = findDeleteButton(container);
    expect(deleteButton).toBeInTheDocument();
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /delete persona/i })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/are you sure you want to delete/i)
    ).toBeInTheDocument();
  });

  test("does not delete persona when cancel is clicked", async () => {
    const { container } = render(
      <TooltipProvider>
        <PersonasTab />
      </TooltipProvider>
    );

    const deleteButton = findDeleteButton(container);
    expect(deleteButton).toBeInTheDocument();
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /delete persona/i })
      ).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /delete persona/i })
      ).not.toBeInTheDocument();
    });

    expect(mockRemovePersonaMutation).not.toHaveBeenCalled();
  });

  test("deletes persona when confirm is clicked", async () => {
    mockRemovePersonaMutation.mockResolvedValue(undefined);

    const { container } = render(
      <TooltipProvider>
        <PersonasTab />
      </TooltipProvider>
    );

    const deleteButton = findDeleteButton(container);
    expect(deleteButton).toBeInTheDocument();
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /delete persona/i })
      ).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole("button", { name: /^delete$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockRemovePersonaMutation).toHaveBeenCalledWith({
        id: mockPersona._id,
      });
    });
  });
});
