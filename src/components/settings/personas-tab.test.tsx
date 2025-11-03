import type { Doc } from "@convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@convex/_generated/api", () => ({
  api: {
    personas: {
      list: vi.fn(),
      listAllBuiltIn: vi.fn(),
      remove: vi.fn(),
      toggleBuiltInPersona: vi.fn(),
    },
    userSettings: {
      getUserSettings: vi.fn(),
      togglePersonasEnabled: vi.fn(),
    },
  },
}));

vi.mock("@/hooks/use-user-settings", () => ({
  useUserSettings: vi.fn(),
}));

vi.mock("@/providers/user-data-context", () => ({
  useUserDataContext: vi.fn(),
}));

vi.mock("@/providers/toast-context", () => ({
  useToast: vi.fn(),
}));

vi.mock("react-router", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock must mirror export name */
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";
import { PersonasTab } from "./personas-tab";

const useMutationMock = vi.mocked(useMutation);
const useQueryMock = vi.mocked(useQuery);
const useUserSettingsMock = vi.mocked(useUserSettings);
const useUserDataContextMock = vi.mocked(useUserDataContext);
const useToastMock = vi.mocked(useToast);

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

  const mockRemovePersonaMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    useUserDataContextMock.mockReturnValue({
      user: mockUser,
    } as unknown as ReturnType<typeof useUserDataContext>);

    useUserSettingsMock.mockReturnValue({
      personasEnabled: true,
    } as unknown as ReturnType<typeof useUserSettings>);

    (useQueryMock as unknown as vi.Mock).mockImplementation(
      (query: unknown) => {
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
      }
    );

    (useMutationMock as unknown as vi.Mock).mockImplementation(
      (mutation: unknown) => {
        if (mutation === api.personas.remove) {
          return mockRemovePersonaMutation;
        }
        return vi.fn();
      }
    );

    useToastMock.mockReturnValue({
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    } as unknown as ReturnType<typeof useToast>);
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

  it("opens confirmation dialog when delete button is clicked", async () => {
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

  it("does not delete persona when cancel is clicked", async () => {
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

  it("deletes persona when confirm is clicked", async () => {
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
