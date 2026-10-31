import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "@/components/sidebar/AccountMenu";
import { copy, setLocale } from "@/lib/copy";

const assign = vi.fn();
const reload = vi.fn();
const fetchMock = vi.fn();
const realWindow = window;
let methods: { google: boolean; email: boolean; demo?: boolean } = { google: false, email: true };
let me: { signed_in: boolean; email?: string; name?: string | null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

beforeEach(() => {
  setLocale("vi");
  realWindow.history.replaceState(null, "", "/");
  assign.mockReset();
  reload.mockReset();
  methods = { google: false, email: true };
  me = { signed_in: false };
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) {
      if (key === "location") return { href: target.location.href, reload, assign };
      return Reflect.get(target, key);
    },
  }));
  fetchMock.mockReset().mockImplementation(async (path: string) => {
    if (path === "/api/auth/methods") return json(methods);
    if (path === "/api/me") return json(me);
    if (path === "/api/auth/demo") return json({ signed_in: true, email: "demo@email.hello", name: "Demo" });
    if (path === "/api/auth/email/verify") return json({ signed_in: true, email: "student@example.com", name: null });
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  realWindow.history.replaceState(null, "", "/");
});

async function open() {
  fireEvent.click(await screen.findByRole("button", { name: me.signed_in ? copy.authAccount : copy.historyLogin }));
}

async function send() {
  await open();
  fireEvent.change(screen.getByRole("textbox", { name: copy.authEmail }), { target: { value: "student@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: copy.authSend }));
  await screen.findByRole("textbox", { name: copy.authCode });
}

function verify() {
  fireEvent.change(screen.getByRole("textbox", { name: copy.authCode }), { target: { value: "123456" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.authVerify }));
}

describe("AccountMenu", () => {
  it.each([
    ["vi", "Em đã đọc Điều khoản và Chính sách quyền riêng tư."],
    ["en", "I have read the Terms and Privacy Policy."],
  ] as const)("renders the %s consent as one linked sentence and keeps footer actions together", async (locale, sentence) => {
    setLocale(locale);
    methods = { google: true, email: false };
    render(<AccountMenu />);
    await open();
    fireEvent.change(screen.getByRole("spinbutton", { name: copy.authAge }), { target: { value: "15" } });
    const checkbox = screen.getByRole("checkbox", { name: sentence }) as HTMLInputElement;
    const label = checkbox.closest("label")!;
    expect(label.textContent?.replace(/\s+/g, " ").trim()).toBe(sentence);
    const links = within(label).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual([copy.authTerms, copy.authPrivacy]);
    expect(links.map(link => link.getAttribute("href"))).toEqual([
      `${copy.authLegalBase}/terms`, `${copy.authLegalBase}/privacy`,
    ]);
    fireEvent.click(label);
    expect(checkbox.checked).toBe(true);
    const google = screen.getByRole("button", { name: copy.authGoogle }) as HTMLButtonElement;
    expect(google.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: copy.authParentConsent }).closest("label")!);
    expect(google.disabled).toBe(false);
    const close = screen.getByRole("button", { name: copy.drawerClose });
    expect(close.parentElement).toBe(google.parentElement);
    expect(Array.from(close.parentElement!.children)).toEqual([close, google]);
  });

  it.each([
    ["vi", "https://www.dfriend.online", "Bằng việc đăng nhập, bạn đồng ý với Điều khoản và Chính sách quyền riêng tư"],
    ["en", "https://www.dfriend.online/en", "By signing in, you agree to the Terms and Privacy Policy"],
  ] as const)("links the %s login notice to the matching public legal pages", async (locale, base, notice) => {
    setLocale(locale);
    methods = { google: true, email: false };
    render(<AccountMenu />);
    await open();
    const dialog = within(screen.getByRole("dialog"));
    const terms = dialog.getByRole("link", { name: copy.authTerms });
    const privacy = dialog.getByRole("link", { name: copy.authPrivacy });
    expect(terms.getAttribute("href")).toBe(`${base}/terms`);
    expect(privacy.getAttribute("href")).toBe(`${base}/privacy`);
    expect(terms.parentElement?.textContent?.replace(/\s+/g, " ").trim()).toBe(notice);
  });

  it("does not show the login agreement in the signed-in account view", async () => {
    me = { signed_in: true, email: "student@example.com" };
    render(<AccountMenu />);
    await open();
    expect(screen.queryByRole("link", { name: copy.authTerms })).toBeNull();
    expect(screen.queryByRole("link", { name: copy.authPrivacy })).toBeNull();
  });

  it("renders nothing when both methods are disabled", async () => {
    methods = { google: false, email: false };
    const { container } = render(<AccountMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing on a startup request failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { container } = render(<AccountMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.innerHTML).toBe("");
  });

  it("shows only Google when only Google is enabled", async () => {
    methods = { google: true, email: false };
    render(<AccountMenu />);
    await open();
    const button = screen.getByRole("button", { name: copy.authGoogle }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Bạn bao nhiêu tuổi?" }), { target: { value: "16" } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(assign).toHaveBeenCalledWith("/api/auth/google/start?age=16");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(copy.authOptional)).toBeDefined();
  });

  it("starts email login, verifies the code, and reloads", async () => {
    render(<AccountMenu />);
    await send();
    expect(screen.queryByRole("link", { name: copy.authGoogle })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/email/start", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json" }, body: '{"email":"student@example.com"}',
    }));
    const input = screen.getByRole("textbox", { name: copy.authCode });
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("maxlength")).toBe("6");
    verify();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/email/verify", expect.objectContaining({
      method: "POST", body: '{"email":"student@example.com","code":"123456"}',
    }));
  });

  it("shows invalid_code without reloading", async () => {
    render(<AccountMenu />);
    await send();
    fetchMock.mockResolvedValueOnce(json({ error: { code: "invalid_code" } }, 400));
    verify();
    expect((await screen.findByRole("alert")).textContent).toBe(copy.authInvalidCode);
    expect(reload).not.toHaveBeenCalled();
  });

  it("can resend a code and shows rate limiting", async () => {
    render(<AccountMenu />);
    await send();
    fetchMock.mockResolvedValueOnce(json({ error: { code: "rate_limited" } }, 429));
    fireEvent.click(screen.getByRole("button", { name: copy.authResend }));
    expect((await screen.findByRole("alert")).textContent).toBe(copy.authRateLimited);
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/auth/email/start")).toHaveLength(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows a generic failure for malformed input responses", async () => {
    render(<AccountMenu />);
    await send();
    fetchMock.mockResolvedValueOnce(json({ error: { code: "invalid_body" } }, 400));
    verify();
    expect((await screen.findByRole("alert")).textContent).toBe(copy.authActionFailed);
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows the signed-in email and name, logs out with JSON, and reloads", async () => {
    me = { signed_in: true, email: "student@example.com", name: "Minh" };
    render(<AccountMenu />);
    await open();
    expect(screen.getByRole("button", { name: copy.authAccount }).querySelector('[aria-hidden="true"]')?.textContent).toBe("M");
    expect(screen.getByText("student@example.com")).toBeDefined();
    expect(within(screen.getByRole("dialog")).getByText("Minh")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: copy.authLogout }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));
  });

  it("keeps logout available to a signed-in user when login providers are disabled", async () => {
    methods = { google: false, email: false };
    me = { signed_in: true, email: "student@example.com", name: "Minh" };
    render(<AccountMenu />);
    await open();
    fireEvent.click(screen.getByRole("button", { name: copy.authLogout }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));
  });

  it("opens a one-time login failure and strips only its query parameter", async () => {
    realWindow.history.replaceState({ saved: true }, "", "/?login=failed&keep=1#work");
    render(<AccountMenu />);
    expect((await screen.findByRole("alert")).textContent).toBe(copy.authFailed);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(realWindow.location.search).toBe("?keep=1");
    expect(realWindow.location.hash).toBe("#work");
    expect(realWindow.history.state).toEqual({ saved: true });
    fireEvent.click(screen.getByRole("button", { name: copy.drawerClose }));
    await open();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("strips login=ok without opening the sheet", async () => {
    realWindow.history.replaceState(null, "", "/?login=ok");
    render(<AccountMenu />);
    await screen.findByRole("button", { name: copy.historyLogin });
    expect(realWindow.location.search).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    render(<AccountMenu />);
    await open();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: copy.historyLogin }));
  });
});

it("closes on outside tap and when another corner sheet opens", async () => {
  render(<AccountMenu />);
  await open();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
  await open();
  fireEvent(window, new CustomEvent("df-sheet-open", { detail: "feedback" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("reports auth availability and shows an icon-only rail footer", async () => {
  const onStatus = vi.fn();
  render(<AccountMenu rail onStatus={onStatus} />);
  const trigger = await screen.findByRole("button", { name: copy.historyLogin });
  expect(trigger.textContent).toBe("");
  expect(onStatus).toHaveBeenCalledWith({ signedIn: false, enabled: true });
});


it("requires both minor consents and sends age and consent to Google start", async () => {
  methods = { google: true, email: false };
  render(<AccountMenu />);
  await open();
  const age = screen.getByRole("spinbutton", { name: "Bạn bao nhiêu tuổi?" });
  const button = screen.getByRole("button", { name: copy.authGoogle }) as HTMLButtonElement;
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(assign).not.toHaveBeenCalled();
  fireEvent.change(age, { target: { value: "15" } });
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(2);
  expect(button.disabled).toBe(true);
  expect(screen.getByRole("link", { name: copy.authTerms }).getAttribute("href")).toBe(`${copy.authLegalBase}/terms`);
  expect(screen.getByRole("link", { name: copy.authPrivacy }).getAttribute("href")).toBe(`${copy.authLegalBase}/privacy`);
  fireEvent.click(boxes[0]);
  expect(button.disabled).toBe(true);
  fireEvent.click(boxes[1]);
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(assign).toHaveBeenLastCalledWith("/api/auth/google/start?age=15&consent=1");
  fireEvent.click(boxes[0]);
  expect(button.disabled).toBe(true);
  fireEvent.change(age, { target: { value: "16" } });
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(assign).toHaveBeenLastCalledWith("/api/auth/google/start?age=16");
});

it.each(["", "5", "100", "16.5"])("disables Google for invalid age %s", async (value) => {
  methods = { google: true, email: false };
  render(<AccountMenu />);
  await open();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Bạn bao nhiêu tuổi?" }), { target: { value } });
  expect((screen.getByRole("button", { name: copy.authGoogle }) as HTMLButtonElement).disabled).toBe(true);
});

it("signs in with demo credentials using the normal account flow", async () => {
  setLocale("en");
  methods = { google: false, email: false, demo: true };
  render(<AccountMenu />);
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Demo sign in" }));
  fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "demo@email.hello" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "123456" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.authVerify }));
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/demo", expect.objectContaining({
    method: "POST", body: '{"email":"demo@email.hello","password":"123456"}',
  }));
});

it("keeps sign out and close in the same action row", async () => {
  me = { signed_in: true, email: "demo@email.hello" };
  render(<AccountMenu />);
  await open();
  expect(screen.getByRole("button", { name: copy.authLogout }).parentElement)
    .toBe(screen.getByRole("button", { name: copy.drawerClose }).parentElement);
});
