import { trialBannerState, TrialInfo } from "../purchases/trialBanner";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

function info(hoursLeft: number, over: Partial<TrialInfo> = {}): TrialInfo {
  return { periodType: "TRIAL", willRenew: true, expiresAtMs: NOW + hoursLeft * HOUR, ...over };
}

describe("trialBannerState — the in-app trial-ending banner", () => {
  it("shows nothing when there is no trial information", () => {
    expect(trialBannerState(null, NOW)).toBeNull();
  });

  it("shows nothing for a paid (non-trial) period", () => {
    expect(trialBannerState(info(48, { periodType: "NORMAL" }), NOW)).toBeNull();
  });

  it("recognises a trial regardless of letter case", () => {
    expect(trialBannerState(info(48, { periodType: "trial" }), NOW)).not.toBeNull();
  });

  it("shows nothing once the user has turned off renewal (nothing to warn about)", () => {
    expect(trialBannerState(info(48, { willRenew: false }), NOW)).toBeNull();
  });

  it("shows nothing once the trial has already ended", () => {
    expect(trialBannerState(info(0), NOW)).toBeNull();
    expect(trialBannerState(info(-5), NOW)).toBeNull();
  });

  it("shows nothing when the end time is unknown or invalid", () => {
    expect(trialBannerState(info(48, { expiresAtMs: 0 }), NOW)).toBeNull();
    expect(trialBannerState(info(48, { expiresAtMs: NaN }), NOW)).toBeNull();
  });

  it("stays hidden until the last 3 days of the trial", () => {
    expect(trialBannerState(info(72.1), NOW)).toBeNull();
    expect(trialBannerState(info(120), NOW)).toBeNull();
  });

  it("appears with 3 days (72 hours) left, inclusive", () => {
    expect(trialBannerState(info(72), NOW)?.kind).toBe("cancel-window");
  });

  it("gives a cancel-by time exactly 24 hours before the trial ends", () => {
    const s = trialBannerState(info(48), NOW);
    expect(s?.kind).toBe("cancel-window");
    expect(s?.endsAtMs).toBe(NOW + 48 * HOUR);
    expect(s?.cancelByMs).toBe(NOW + 24 * HOUR);
  });

  it("is still inside the cancel window at exactly 24 hours left", () => {
    expect(trialBannerState(info(24), NOW)?.kind).toBe("cancel-window");
  });

  it("switches to the past-cutoff message once fewer than 24 hours remain", () => {
    const s = trialBannerState(info(23.9), NOW);
    expect(s?.kind).toBe("past-cutoff");
    expect(s?.endsAtMs).toBe(NOW + 23.9 * HOUR);
  });
});
