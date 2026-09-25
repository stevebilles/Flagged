import { entitlementWithinTimeout } from "../purchases/launchEntitlement";

const TIMEOUT = 3000;

/** A refresh we settle by hand, so each test controls exactly when RevenueCat "answers". */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("entitlementWithinTimeout — don't hold app launch hostage to RevenueCat", () => {
  it("returns RevenueCat's answer when it arrives before the timeout", async () => {
    const refresh = deferred<boolean>();
    const result = entitlementWithinTimeout(() => refresh.promise, () => false, TIMEOUT);

    refresh.resolve(true);

    await expect(result).resolves.toBe(true);
  });

  it("falls back to the cached entitlement when RevenueCat is too slow", async () => {
    const refresh = deferred<boolean>(); // never settles in this test
    const result = entitlementWithinTimeout(() => refresh.promise, () => true, TIMEOUT);

    jest.advanceTimersByTime(TIMEOUT);

    await expect(result).resolves.toBe(true);
  });

  it("does not give up before the timeout has elapsed", async () => {
    const refresh = deferred<boolean>();
    let settled = false;
    void entitlementWithinTimeout(() => refresh.promise, () => true, TIMEOUT).then(() => {
      settled = true;
    });

    jest.advanceTimersByTime(TIMEOUT - 1);
    await Promise.resolve();

    expect(settled).toBe(false);
  });

  it("still delivers a late answer, so a lapsed subscription re-locks the app", async () => {
    const refresh = deferred<boolean>();
    const onLate = jest.fn();
    const result = entitlementWithinTimeout(() => refresh.promise, () => true, TIMEOUT, onLate);

    jest.advanceTimersByTime(TIMEOUT);
    await expect(result).resolves.toBe(true); // launched on the cache
    expect(onLate).not.toHaveBeenCalled();

    refresh.resolve(false); // RevenueCat finally says: not subscribed
    await Promise.resolve();
    await Promise.resolve();

    expect(onLate).toHaveBeenCalledTimes(1);
    expect(onLate).toHaveBeenCalledWith(false);
  });

  it("does not call the late-answer callback when RevenueCat answered in time", async () => {
    const refresh = deferred<boolean>();
    const onLate = jest.fn();
    const result = entitlementWithinTimeout(() => refresh.promise, () => false, TIMEOUT, onLate);

    refresh.resolve(true);
    await result;
    jest.advanceTimersByTime(TIMEOUT * 2);
    await Promise.resolve();

    expect(onLate).not.toHaveBeenCalled();
  });

  it("falls back to the cache if the refresh rejects", async () => {
    const result = entitlementWithinTimeout(
      () => Promise.reject(new Error("network down")),
      () => true,
      TIMEOUT,
    );

    await expect(result).resolves.toBe(true);
  });

  it("swallows a rejection that arrives after the timeout (no unhandled rejection)", async () => {
    const refresh = deferred<boolean>();
    const onLate = jest.fn();
    const result = entitlementWithinTimeout(() => refresh.promise, () => true, TIMEOUT, onLate);

    jest.advanceTimersByTime(TIMEOUT);
    await result;
    refresh.reject(new Error("too late and broken"));
    await Promise.resolve();
    await Promise.resolve();

    expect(onLate).not.toHaveBeenCalled();
  });

  it("leaves no timer running once RevenueCat has answered", async () => {
    const refresh = deferred<boolean>();
    const result = entitlementWithinTimeout(() => refresh.promise, () => false, TIMEOUT);

    refresh.resolve(true);
    await result;

    expect(jest.getTimerCount()).toBe(0);
  });
});
