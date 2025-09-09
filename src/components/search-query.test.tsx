import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchQuery } from "./search-query";

describe("SearchQuery", () => {
  it("renders nothing when not loading", () => {
    const { container } = render(<SearchQuery isLoading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows searching message with default text", () => {
    render(<SearchQuery isLoading feature="similar" />);
    expect(screen.getByText(/Finding similar pages/i)).toBeInTheDocument();
  });

  it("shows done state with category label", () => {
    render(
      <SearchQuery
        isLoading
        category="news"
        citations={[
          {
            type: "url_citation",
            url: "https://example.com",
            title: "ex",
          },
        ]}
      />
    );
    expect(screen.getByText(/Found 1 news articles/i)).toBeInTheDocument();
  });
});
