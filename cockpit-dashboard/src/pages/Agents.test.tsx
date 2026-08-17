import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Agents } from "./Agents.js";

afterEach(() => vi.restoreAllMocks());

describe("Agents page", () => {
  it("lists agents and creates a new one", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "2", name: "New Agent", email: "n@a.com", role: "agent" }) });
      }
      return Promise.resolve({ ok: true, json: async () => [{ id: "1", name: "Existing", email: "e@a.com", role: "admin" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Agents />);

    await waitFor(() => expect(screen.getByText("e@a.com")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "New Agent" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "n@a.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "pw123456" } });
    fireEvent.click(screen.getByRole("button", { name: /add agent/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/agents"), expect.objectContaining({ method: "POST" }))
    );
  });
});
