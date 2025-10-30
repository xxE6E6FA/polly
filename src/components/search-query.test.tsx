import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchQuery } from "./search-query";

describe("SearchQuery", () => {
  it("renders nothing when not loading", () => {
    const { container } = render(<SearchQuery isLoading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows spinner and search message when loading", () => {
    render(<SearchQuery isLoading feature="similar" />);
    expect(screen.getByText(/similar/i)).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows different messages for different features", () => {
    const { rerender } = render(<SearchQuery isLoading feature="answer" />);
    expect(screen.getByText(/answer/i)).toBeInTheDocument();

    rerender(<SearchQuery isLoading feature="similar" />);
    expect(screen.getByText(/similar/i)).toBeInTheDocument();

    rerender(<SearchQuery isLoading />);
    expect(screen.getByText(/searching|web|information/i)).toBeInTheDocument();
  });

  it("shows done state with checkmark and citation count", () => {
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
    expect(screen.getByText(/Found/i)).toBeInTheDocument();
    expect(screen.getByText(/news articles/i)).toBeInTheDocument();
    expect(
      document.querySelector("svg path[d*='M5 13l4 4L19 7']")
    ).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("shows correct citation count in badge", () => {
    const citations = [
      {
        type: "url_citation" as const,
        url: "https://example.com/1",
        title: "1",
      },
      {
        type: "url_citation" as const,
        url: "https://example.com/2",
        title: "2",
      },
      {
        type: "url_citation" as const,
        url: "https://example.com/3",
        title: "3",
      },
    ];
    render(<SearchQuery isLoading citations={citations} />);
    const badges = screen.getAllByText("3");
    expect(badges.length).toBeGreaterThan(0);
  });
});
