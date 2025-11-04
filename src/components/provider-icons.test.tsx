import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ProviderIcon } from "./provider-icons";

describe("ProviderIcon", () => {
  test("renders Google Gemini icon with title", () => {
    render(<ProviderIcon provider="google" />);
    expect(screen.getByTitle("Gemini")).toBeInTheDocument();
  });

  test("renders Anthropic icon with title", () => {
    render(<ProviderIcon provider="anthropic" />);
    expect(screen.getByTitle("Anthropic")).toBeInTheDocument();
  });

  test("renders Replicate icon with title", () => {
    render(<ProviderIcon provider="replicate" />);
    expect(screen.getByTitle("Replicate")).toBeInTheDocument();
  });

  test("renders OpenRouter icon with title", () => {
    render(<ProviderIcon provider="openrouter" />);
    expect(screen.getByTitle("OpenRouter")).toBeInTheDocument();
  });
});
