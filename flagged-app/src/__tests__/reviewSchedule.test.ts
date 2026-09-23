import { nextReviewMoment, pickTrialStartMs, ReviewMoment } from "../review/reviewSchedule";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 8, 1, 12, 0, 0); // trial activated

function due(daysAfterStart: number, asked: ReviewMoment[] = [], trialStartMs: number | null = START) {
  return nextReviewMoment({ nowMs: START + daysAfterStart * DAY, trialStartMs, asked });
}

describe("nextReviewMoment — the three review requests", () => {
  it("asks during the trial on a completed scan when nothing has been asked yet", () => {
    expect(due(0)).toBe("trial");
    expect(due(3)).toBe("trial");
    expect(due(6.9)).toBe("trial");
  });

  it("does not ask again during the trial once the trial request was made", () => {
    expect(due(3, ["trial"])).toBeNull();
  });

  it("asks after the trial has ended (from day 7 on) if not yet asked", () => {
    expect(due(7, ["trial"])).toBe("post-trial");
    expect(due(12, ["trial"])).toBe("post-trial");
  });

  it("never asks the in-trial request once the trial window is over, even if it never fired", () => {
    expect(due(9)).toBe("post-trial");
  });

  it("asks 30 days after the trial was activated, once the earlier requests are done", () => {
    expect(due(30, ["trial", "post-trial"])).toBe("day-30");
    expect(due(45, ["trial", "post-trial"])).toBe("day-30");
  });

  it("does not ask the 30-day request before day 30", () => {
    expect(due(29.9, ["trial", "post-trial"])).toBeNull();
  });

  it("makes at most one request per completed scan, in order, when several are due", () => {
    expect(due(40)).toBe("post-trial");
    expect(due(40, ["post-trial"])).toBe("day-30");
    expect(due(40, ["post-trial", "day-30"])).toBeNull();
  });

  it("never asks more than once each: nothing is due when all three were asked", () => {
    expect(due(60, ["trial", "post-trial", "day-30"])).toBeNull();
  });

  it("asks nothing when the trial start is unknown", () => {
    expect(due(3, [], null)).toBeNull();
  });

  it("treats a clock that went backwards as still inside the trial", () => {
    expect(nextReviewMoment({ nowMs: START - DAY, trialStartMs: START, asked: [] })).toBe("trial");
  });
});

describe("pickTrialStartMs", () => {
  it("prefers the store's original purchase date over the locally recorded first-seen time", () => {
    expect(pickTrialStartMs(1000, 5000)).toBe(1000);
  });

  it("falls back to the locally recorded first-seen time when the store date is unavailable", () => {
    expect(pickTrialStartMs(null, 5000)).toBe(5000);
  });

  it("returns null when neither is known", () => {
    expect(pickTrialStartMs(null, null)).toBeNull();
  });

  it("ignores non-positive or non-finite values", () => {
    expect(pickTrialStartMs(0, 5000)).toBe(5000);
    expect(pickTrialStartMs(NaN, null)).toBeNull();
  });
});
