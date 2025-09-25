import type { Doc } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationListContent } from "./conversation-list-content";

describe("ConversationListContent", () => {
  it("renders skeleton when loading", () => {
    render(
      <ConversationListContent
        conversations={[] as Doc<"conversations">[]}
        searchQuery=""
        isLoading
      />
    );

    expect(
      screen.getByTestId("conversation-list-skeleton")
    ).toBeInTheDocument();
  });
});
