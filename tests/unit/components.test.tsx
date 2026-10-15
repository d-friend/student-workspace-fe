import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Bubble } from "@/components/rail/Bubble";
import { Composer } from "@/components/rail/Composer";
import { RailHeader } from "@/components/rail/RailHeader";
import { RestateChips } from "@/components/rail/RestateChips";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { EmptyState } from "@/components/work/EmptyState";
import { copy } from "@/lib/copy";

afterEach(cleanup);

const composerProps = () => ({
  value: "hi",
  onChange: vi.fn(),
  onSend: vi.fn(),
  onPickPhoto: vi.fn(),
  placeholder: copy.placeholderEmpty,
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

test("with a photo: the note label shows, the camera hides, and remove calls onRemove", () => {
  const onRemove = vi.fn();
  render(<Composer {...composerProps()} photo={{ src: "data:,", onRemove }} />);
  expect(screen.getByLabelText(copy.noteLabel)).toBeTruthy();
  expect(screen.queryByRole("button", { name: copy.pickPhoto })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.removePhoto }));
  expect(onRemove).toHaveBeenCalledTimes(1);
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

test("a sample row starts its sample", () => {
  const onStarter = vi.fn();
  render(<EmptyState onSnap={vi.fn()} onType={vi.fn()} onStarter={onStarter} />);
  fireEvent.click(screen.getByText(copy.starter2));
  expect(onStarter).toHaveBeenCalledWith("geometry");
});

test("the building skeleton shows its status pill", () => {
  render(<BuildingSkeleton />);
  expect(screen.getByRole("status").textContent).toBe(copy.thinking);
});

test("Bài mới shows only when asked", () => {
  const { rerender } = render(<RailHeader showNewProblem={false} onNewProblem={vi.fn()} />);
  expect(screen.queryByRole("button", { name: copy.newProblem })).toBeNull();
  rerender(<RailHeader showNewProblem onNewProblem={vi.fn()} />);
  expect(screen.getByRole("button", { name: copy.newProblem })).toBeTruthy();
});
