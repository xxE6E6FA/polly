import { describe, expect, test } from "bun:test";
import { getByText, render, screen } from "@testing-library/react";
import { SearchQuery } from "./search-query";

describe("SearchQuery", () => {
  test("renders nothing when not loading", () => {
    const { container } = render(<SearchQuery isLoading={false} />);
    expect(container.firstChild).toBeNull();
  });

  test("shows spinner and search message when loading", () => {
    const { container } = render(<SearchQuery isLoading feature="similar" />);
    expect(screen.getByText(/similar/i)).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  test("shows different messages for different features", () => {
    const { rerender, container } = render(
      <SearchQuery isLoading feature="answer" />
    );
    expect(screen.getByText(/answer/i)).toBeInTheDocument();

    rerender(<SearchQuery isLoading feature="similar" />);
    expect(getByText(container, /similar/i)).toBeInTheDocument();

    rerender(<SearchQuery isLoading />);
    expect(
      getByText(container, /searching|web|information/i)
    ).toBeInTheDocument();
  });

  test("shows done state with checkmark and citation count", () => {
    const { container } = render(
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
      container.querySelector("svg path[d*='M5 13l4 4L19 7']")
    ).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  test("shows correct citation count in badge", () => {
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
