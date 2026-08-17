import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Settings } from "./Settings.js";

afterEach(() => vi.restoreAllMocks());

describe("Settings page", () => {
  it("loads current settings and submits provider changes", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ activeProvider: "claude", personaPrompt: "New persona", hasDeepseekKey: true, hasClaudeKey: true, hasOpenaiKey: false, hasGoogleKey: false })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ activeProvider: "deepseek", personaPrompt: "Old persona", hasDeepseekKey: true, hasClaudeKey: false, hasOpenaiKey: false, hasGoogleKey: false })
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Settings />);

    await waitFor(() => expect(screen.getByDisplayValue("Old persona")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/active provider/i), { target: { value: "claude" } });
    fireEvent.change(screen.getByLabelText(/persona prompt/i), { target: { value: "New persona" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/settings"),
        expect.objectContaining({ method: "PUT" })
      )
    );
  });
});
