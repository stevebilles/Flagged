import {
  TEMP_PHOTO_TTL_MS,
  isDeletableTempPath,
  splitExpired,
  type TempPhotoEntry,
} from "../domain/tempPhotoRules";

// The cleanup deletes files, so its safety rules are tested hard: it may only ever touch a scan
// leftover inside the app's own temp/cache folders — never a Pantry thumbnail or anything else.
const ROOTS = [
  "file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/",
  "file:///var/mobile/Containers/Data/Application/ABC/tmp/",
];

describe("isDeletableTempPath", () => {
  it("accepts files in the app's temp and cache folders (with or without file://)", () => {
    expect(isDeletableTempPath("file:///var/mobile/Containers/Data/Application/ABC/tmp/9F3.jpg", ROOTS)).toBe(true);
    expect(isDeletableTempPath("/var/mobile/Containers/Data/Application/ABC/tmp/9F3.jpg", ROOTS)).toBe(true);
    expect(
      isDeletableTempPath("file:///var/mobile/Containers/Data/Application/ABC/Library/Caches/ImagePicker/x.jpg", ROOTS)
    ).toBe(true);
  });

  it("refuses the Pantry thumbnails in the documents folder", () => {
    expect(
      isDeletableTempPath("file:///var/mobile/Containers/Data/Application/ABC/Documents/pantry/1-a.jpg", ROOTS)
    ).toBe(false);
  });

  it("refuses anything outside the roots, path tricks, empty input, and an empty root list", () => {
    expect(isDeletableTempPath("file:///var/mobile/Media/DCIM/100APPLE/IMG_1.JPG", ROOTS)).toBe(false);
    expect(isDeletableTempPath("file:///var/mobile/Containers/Data/Application/ABC/tmp/../Documents/db.sqlite", ROOTS)).toBe(false);
    expect(isDeletableTempPath("", ROOTS)).toBe(false);
    expect(isDeletableTempPath("file:///var/mobile/Containers/Data/Application/ABC/tmp/x.jpg", [])).toBe(false);
  });

  it("refuses a pantry/ path even if it were somehow under a temp root", () => {
    expect(isDeletableTempPath("file:///var/mobile/Containers/Data/Application/ABC/tmp/pantry/x.jpg", ROOTS)).toBe(false);
  });
});

describe("splitExpired", () => {
  const NOW = 1_000_000_000_000;
  const entry = (minutesAgo: number): TempPhotoEntry => ({ uri: `f${minutesAgo}`, at: NOW - minutesAgo * 60 * 1000 });

  it("expires photos kept at least 20 minutes and keeps newer ones", () => {
    const { expired, remaining } = splitExpired([entry(5), entry(19), entry(20), entry(90)], NOW);
    expect(expired.map((e) => e.uri)).toEqual(["f20", "f90"]);
    expect(remaining.map((e) => e.uri)).toEqual(["f5", "f19"]);
  });

  it("uses the 20-minute TTL by default", () => {
    expect(TEMP_PHOTO_TTL_MS).toBe(20 * 60 * 1000);
  });

  it("never expires a photo stamped in the future (device clock moved backwards)", () => {
    const future: TempPhotoEntry = { uri: "later", at: NOW + 60 * 60 * 1000 };
    expect(splitExpired([future], NOW).expired).toEqual([]);
  });
});
