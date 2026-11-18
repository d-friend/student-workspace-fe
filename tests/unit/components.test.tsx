import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Bubble } from "@/components/rail/Bubble";
import { Composer } from "@/components/rail/Composer";
import { RestateChips } from "@/components/rail/RestateChips";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { copy } from "@/lib/copy";
import { MAX_PHOTOS } from "@/lib/photo";

afterEach(cleanup);

const composerProps = () => ({
  value: "hi",
  onChange: vi.fn(),
  onSend: vi.fn(),
  onPickPhoto: vi.fn(),
  placeholder: copy.placeholderEmpty,
});

test("only enables the composer scrollbar above its maximum height", () => {
  const props = composerProps();
  const { rerender } = render(<Composer {...props} />);
  const field = screen.getByRole("textbox") as HTMLTextAreaElement;
  Object.defineProperty(field, "scrollHeight", { configurable: true, value: 80 });
  rerender(<Composer {...props} value="short text" />);
  expect(field.style.overflowY).toBe("hidden");
  expect(field.style.scrollbarWidth).toBe("none");
  Object.defineProperty(field, "scrollHeight", { configurable: true, value: 180 });
  rerender(<Composer {...props} value="long text" />);
  expect(field.style.height).toBe("140px");
  expect(field.style.overflowY).toBe("auto");
});

test("Enter sends; Shift+Enter and the Enter that ends an IME composition do not", () => {
  const props = composerProps();
  render(<Composer {...props} />);
  const field = screen.getByRole("textbox");
  fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(field, { key: "Enter", isComposing: true });
  expect(props.onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: "Enter" });
  expect(props.onSend).toHaveBeenCalledTimes(1);
});

test("renders each photo with a remove button and hides Add photo at the limit", () => {
  const photos = Array.from({ length: MAX_PHOTOS }, (_, i) => ({ src: `data:,${i}`, onRemove: vi.fn() }));
  render(<Composer {...composerProps()} photos={photos} />);
  expect(screen.getByLabelText(copy.noteLabel)).toBeTruthy();
  expect(screen.getAllByRole("img", { name: copy.photoChip }).map((img) => img.getAttribute("src"))).toEqual(photos.map(({ src }) => src));
  const remove = screen.getAllByRole("button", { name: copy.removePhoto });
  expect(remove).toHaveLength(MAX_PHOTOS);
  expect(screen.queryByRole("button", { name: copy.addPhoto })).toBeNull();
  fireEvent.click(remove[1]);
  expect(photos[1].onRemove).toHaveBeenCalledOnce();
  expect(photos[0].onRemove).not.toHaveBeenCalled();
});

test("Add photo actions close on Escape, outside tap, and selection", () => {
  const props = { ...composerProps(), onSnapPhoto: vi.fn() };
  render(<Composer {...props} />);
  const add = screen.getByRole("button", { name: copy.addPhoto });
  fireEvent.click(add);
  const snap = screen.getByRole("button", { name: copy.snapPhoto });
  snap.focus();
  fireEvent.keyDown(snap, { key: "Escape" });
  expect(screen.queryByRole("button", { name: copy.snapPhoto })).toBeNull();
  expect(document.activeElement).toBe(add);

  fireEvent.click(add);
  fireEvent.pointerDown(screen.getByRole("textbox"));
  expect(screen.queryByRole("button", { name: copy.pickPhoto })).toBeNull();

  fireEvent.click(add);
  fireEvent.click(screen.getByRole("button", { name: copy.snapPhoto }));
  expect(props.onSnapPhoto).toHaveBeenCalledOnce();
  expect(add.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(add);
  fireEvent.click(screen.getByRole("button", { name: copy.pickPhoto }));
  expect(props.onPickPhoto).toHaveBeenCalledOnce();
  expect(add.getAttribute("aria-expanded")).toBe("false");
});

test("Add photo offers only the gallery on desktop", () => {
  const media = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList);
  try {
    render(<Composer {...composerProps()} onSnapPhoto={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: copy.addPhoto }));
    expect(screen.getByRole("button", { name: copy.pickPhoto })).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.snapPhoto })).toBeNull();
  } finally {
    media.mockRestore();
  }
});

test("the review bubble labels its line", () => {
  render(<Bubble variant="agent-review" line={2}>Dấu “&lt;” cần xem lại.</Bubble>);
  expect(screen.getByText(copy.reviewLabel(2))).toBeTruthy();
});

test("restate chips call confirm and correct", () => {
  const onConfirm = vi.fn();
  const onCorrect = vi.fn();
  render(<RestateChips onConfirm={onConfirm} onCorrect={onCorrect} />);
  fireEvent.click(screen.getByRole("button", { name: copy.restateYes }));
  fireEvent.click(screen.getByRole("button", { name: copy.restateNo }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCorrect).toHaveBeenCalledTimes(1);
});

test("the building skeleton carries no status; the pet bubble reports progress", () => {
  render(<BuildingSkeleton />);
  expect(screen.queryByRole("status")).toBeNull();
});

test("the building skeleton shows the text blocks written so far and greys the rest", () => {
  const preview = {
    phase: "learn" as const,
    title: "Vì sao có bốn mùa?",
    blocks: [{ type: "text" as const, id: "t1", md: "Trục nghiêng" }, { type: "stub" as const, id: "c1" }],
  };
  render(<BuildingSkeleton variant="learn" preview={preview} />);
  expect(screen.getByText("Vì sao có bốn mùa?")).toBeTruthy();
  expect(screen.getByText("Trục nghiêng")).toBeTruthy();
});

test("the building skeleton takes the shape of the target phase", () => {
  const { container, rerender } = render(<BuildingSkeleton variant="learn" />);
  expect(container.querySelector("section")?.dataset.variant).toBe("learn");
  rerender(<BuildingSkeleton variant="solve" />);
  expect(container.querySelector("section")?.dataset.variant).toBe("solve");
});

