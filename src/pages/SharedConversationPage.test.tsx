import { render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SharedConversationPage from "./SharedConversationPage";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return {
    ...actual,
    useParams: () => ({ shareId: "share-123" }),
  };
});

const useQueryMock = vi.mocked(useQuery);

describe("SharedConversationPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("shows a loading state while the shared conversation is loading", () => {
    useQueryMock.mockReturnValue(undefined);

    render(<SharedConversationPage />);

    expect(
      screen.getByTestId("shared-conversation-loading")
    ).toBeInTheDocument();
  });
});
