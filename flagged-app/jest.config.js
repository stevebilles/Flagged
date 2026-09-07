/**
 * Jest config for pure-TS domain/algorithm tests.
 * Uses ts-jest so tests run without the full RN/Expo native runtime.
 * (App-level component tests would use jest-expo; the pure logic here doesn't
 * import any native modules.)
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/src/__tests__/**/*.test.ts"],
};
