import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "@/components/work/ShareButton";
import { track } from "@/lib/track";

vi.mock("@/lib/share", () => ({ shareWorkspace: () => new Promise(() => {}) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const props = { workspaceId: "workspace", sessionId: "session", workspaceCount: 2, sessionUnready: false, title: "Title" };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ShareButton scope menu", () => {
  it.each([
    { workspaceCount: 1, sessionId: "session" },
    { workspaceCount: 2, sessionId: null },
  ])("does not open without multiple workspaces and a session", (overrides) => {
    render(<ShareButton {...props} {...overrides} />);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens with multiple workspaces and a session, and Escape returns focus", () => {
    render(<ShareButton {...props} />);
    const button = screen.getByRole("button", { name: "Chia sẻ" });
    fireEvent.click(button);
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it.each(["Chia sẻ bài này", "Chia sẻ cả phiên (2 bài)"])("returns focus after choosing %s while sharing is pending", (name) => {
    render(<ShareButton {...props} />);
    const button = screen.getByRole("button", { name: "Chia sẻ" });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it.each([
    { name: "Chia sẻ bài này", scope: "workspace", target_id: "workspace" },
    { name: "Chia sẻ cả phiên (2 bài)", scope: "session", target_id: "session" },
  ])("tracks the target when choosing $scope", ({ name, scope, target_id }) => {
    render(<ShareButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    fireEvent.click(screen.getByRole("menuitem", { name }));
    expect(track).toHaveBeenCalledWith("share_clicked", { scope, workspace_count: 2, target_id }, "session");
  });

  it("closes when focus moves outside the wrapper", () => {
    render(<><ShareButton {...props} /><button>Outside</button></>);
    fireEvent.click(screen.getByRole("button", { name: "Chia sẻ" }));
    const outside = screen.getByRole("button", { name: "Outside" });
    act(() => outside.focus());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(outside);
  });
});
