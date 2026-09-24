import { eligibilityFromStatus, paywallCopy, TrialEligibility } from "../purchases/trialEligibility";

describe("eligibilityFromStatus — RevenueCat's answer → what we know", () => {
  it("maps ELIGIBLE (2) to eligible", () => {
    expect(eligibilityFromStatus(2)).toBe("eligible");
  });

  it("maps INELIGIBLE (1) to ineligible", () => {
    expect(eligibilityFromStatus(1)).toBe("ineligible");
  });

  it("treats 'no intro offer exists' (3) as ineligible — there is no trial to promise", () => {
    expect(eligibilityFromStatus(3)).toBe("ineligible");
  });

  it("maps UNKNOWN (0) and anything unexpected to unknown", () => {
    expect(eligibilityFromStatus(0)).toBe("unknown");
    expect(eligibilityFromStatus(99)).toBe("unknown");
    expect(eligibilityFromStatus(undefined)).toBe("unknown");
    expect(eligibilityFromStatus(null)).toBe("unknown");
  });
});

describe("paywallCopy — only promise the free trial to people who get it", () => {
  it("promises the trial to an eligible user", () => {
    const c = paywallCopy("eligible");
    expect(c.showTrialPill).toBe(true);
    expect(c.showTrialReminder).toBe(true);
    expect(c.cta).toBe("Start your 7-day free trial");
    expect(c.summary).toContain("7-day free trial");
    expect(c.summary).toContain("No charge today");
  });

  it("shows the trial wording while the check is still running (it's brief)", () => {
    expect(paywallCopy("checking")).toEqual(paywallCopy("eligible"));
  });

  it("never mentions a free trial or 'no charge today' to an ineligible user", () => {
    const c = paywallCopy("ineligible");
    expect(c.showTrialPill).toBe(false);
    expect(c.showTrialReminder).toBe(false);
    expect(`${c.cta} ${c.summary}`.toLowerCase()).not.toContain("trial");
    expect(c.summary).not.toContain("No charge today");
  });

  it("uses a plain subscribe button for an ineligible user", () => {
    expect(paywallCopy("ineligible").cta).toBe("Subscribe for $24.99/year");
  });

  it("does not promise a trial when eligibility couldn't be determined", () => {
    expect(paywallCopy("unknown")).toEqual(paywallCopy("ineligible"));
  });

  it("always states the price and automatic renewal, whatever the eligibility", () => {
    const all: TrialEligibility[] = ["checking", "eligible", "ineligible", "unknown"];
    for (const e of all) {
      const { summary } = paywallCopy(e);
      expect(summary).toContain("$24.99");
      expect(summary.toLowerCase()).toContain("renew");
    }
  });
});
