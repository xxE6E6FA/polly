import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderIcon } from "./provider-icons";

describe("ProviderIcon", () => {
  it("renders Google Gemini icon with title", () => {
    render(<ProviderIcon provider="google" />);
    expect(screen.getByTitle("Gemini")).toBeInTheDocument();
  });

  it("renders Anthropic icon with title", () => {
    render(<ProviderIcon provider="anthropic" />);
    expect(screen.getByTitle("Anthropic")).toBeInTheDocument();
  });

  it("renders Replicate icon with title", () => {
    render(<ProviderIcon provider="replicate" />);
    expect(screen.getByTitle("Replicate")).toBeInTheDocument();
  });

  it("renders OpenRouter icon with title", () => {
    render(<ProviderIcon provider="openrouter" />);
    expect(screen.getByTitle("OpenRouter")).toBeInTheDocument();
  });
});
