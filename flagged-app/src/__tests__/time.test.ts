import { elapsedSince, hasElapsed } from "../domain/time";

const DAY = 24 * 60 * 60 * 1000;

describe("elapsedSince / hasElapsed — backwards-clock safety", () => {
  it("measures forward elapsed time normally", () => {
    const now = 1_000_000_000_000;
    expect(elapsedSince(now - 5 * DAY, now)).toBe(5 * DAY);
  });

  it("clamps negative elapsed (clock moved back) to 0", () => {
    const now = 1_000_000_000_000;
    // item verified 'in the future' relative to a rewound clock
    expect(elapsedSince(now + 10 * DAY, now)).toBe(0);
  });

  it("hasElapsed: an item 31 days old is due for a 30-day window", () => {
    const now = 2_000_000_000_000;
    expect(hasElapsed(now - 31 * DAY, 30 * DAY, now)).toBe(true);
  });

  it("hasElapsed: an item 29 days old is not yet due", () => {
    const now = 2_000_000_000_000;
    expect(hasElapsed(now - 29 * DAY, 30 * DAY, now)).toBe(false);
  });

  it("hasElapsed: a rewound clock never makes an item due early", () => {
    const now = 2_000_000_000_000;
    expect(hasElapsed(now + 100 * DAY, 30 * DAY, now)).toBe(false);
  });

  it("hasElapsed: exactly at the window boundary is not yet elapsed (strictly greater)", () => {
    const now = 2_000_000_000_000;
    expect(hasElapsed(now - 30 * DAY, 30 * DAY, now)).toBe(false);
  });
});
