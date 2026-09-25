import * as fs from "fs";
import * as path from "path";

/**
 * Wording guard (owner's rule, 2026-09-25). A scan only reports which of the user's red flags it did
 * or didn't find in the text it read — it can miss things (OCR errors, ingredients not on the
 * profile's list). So nothing user-facing may name or imply that a saved product is "safe",
 * "approved" or "cleared"; the Pantry is "My Pantry", not a safe list. This scans the app's own
 * source plus the outward-facing legal pages and store listing, so a phrase like that can't creep
 * back in unnoticed. If it fails, reword — don't add an exception.
 */
const ROOT = path.resolve(__dirname, "..", "..");

const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /\bsafe[\s-]*(list|foods?|products?|items?)\b/i, why: '"safe list / safe foods" implies a safety guarantee' },
  { pattern: /\bapproved[\s-]*(list|foods?|items?|products?)\b/i, why: '"approved list / approved foods" implies a safety guarantee' },
  { pattern: /\bstill approved\b/i, why: '"still approved" implies a safety guarantee' },
  { pattern: /\bcleared products?\b/i, why: '"cleared products" implies a safety guarantee' },
  { pattern: /\ball clear\b/i, why: '"all clear" implies a safety guarantee' },
  { pattern: /\bsafe to (eat|consume|buy)\b/i, why: '"safe to eat" is a safety claim' },
  { pattern: /\bsecond-guess\b/i, why: 'implies the user never needs to re-check the label' },
  // A "CLEAN"-style status pill/tag on a results screen (owner, 2026-09-25). Only matches a Text whose
  // whole content is the word, so the results screen's verdict stamp (a prop, not JSX text) and prose
  // like "No red flags found" aren't caught.
  { pattern: /<Text\b[^>]*>\s*(CLEAN|CLEAR|SAFE|OK)\s*<\/Text>/, why: 'a "CLEAN"-style status pill can be read as a safety claim' },
];

function walk(dir: string, exts: string[], skip: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip(full)) continue;
    if (entry.isDirectory()) out.push(...walk(full, exts, skip));
    else if (exts.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function filesToScan(): string[] {
  const skip = (p: string) => p.includes(`${path.sep}__tests__`) || p.includes(`${path.sep}node_modules`);
  const files = [
    ...walk(path.join(ROOT, "app"), [".ts", ".tsx"], skip),
    ...walk(path.join(ROOT, "src"), [".ts", ".tsx"], skip),
    ...walk(path.join(ROOT, "legal"), [".md"], skip),
    path.join(ROOT, "docs", "15-store-listing.md"),
  ];
  return files.filter((f) => fs.existsSync(f));
}

describe("copy guard — no safety-implying wording", () => {
  const files = filesToScan();

  it("scans a meaningful set of files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("finds none of the banned phrases", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const { pattern, why } of BANNED) {
          if (pattern.test(line)) {
            hits.push(`${path.relative(ROOT, file)}:${i + 1}  ${why}\n    ${line.trim()}`);
          }
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
