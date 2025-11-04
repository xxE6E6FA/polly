import { describe, expect, test } from "bun:test";
import type { Doc } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";

import { ConversationListContent } from "./conversation-list-content";

describe("ConversationListContent", () => {
  test("renders skeleton when loading", () => {
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
