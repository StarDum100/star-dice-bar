const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "module.json"), "utf-8")
);

describe("module.json", () => {
  describe("required fields", () => {
    it("has an id", () => expect(manifest.id).toBeTruthy());
    it("has a title", () => expect(manifest.title).toBeTruthy());
    it("has a version", () => expect(manifest.version).toBeTruthy());
  });

  it("version is valid semver", () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe("compatibility", () => {
    it("declares a minimum version", () => {
      expect(manifest.compatibility?.minimum).toBeDefined();
    });

    it("declares a verified version", () => {
      expect(manifest.compatibility?.verified).toBeDefined();
    });

    it("minimum and verified are numeric version strings", () => {
      expect(String(manifest.compatibility.minimum)).toMatch(/^\d+(\.\d+)*$/);
      expect(String(manifest.compatibility.verified)).toMatch(/^\d+(\.\d+)*$/);
    });

    it("verified is not older than minimum", () => {
      const toNum = (v) =>
        String(v)
          .split(".")
          .reduce((acc, part, i) => acc + Number(part) * Math.pow(1000, 2 - i), 0);
      expect(toNum(manifest.compatibility.verified)).toBeGreaterThanOrEqual(
        toNum(manifest.compatibility.minimum)
      );
    });
  });

  describe("file references", () => {
    it("lists the main script as an ES module", () => {
      expect(manifest.esmodules).toContain("scripts/main.js");
    });

    it("all declared esmodules exist on disk", () => {
      for (const script of manifest.esmodules ?? []) {
        expect(fs.existsSync(path.join(ROOT, script))).toBe(true);
      }
    });

    it("all declared styles exist on disk", () => {
      for (const style of manifest.styles ?? []) {
        expect(fs.existsSync(path.join(ROOT, style))).toBe(true);
      }
    });

    it("all declared language files exist on disk", () => {
      for (const language of manifest.languages ?? []) {
        expect(fs.existsSync(path.join(ROOT, language.path))).toBe(true);
      }
    });
  });

  describe("languages", () => {
    it("declares at least one language", () => {
      expect(manifest.languages?.length).toBeGreaterThan(0);
    });

    it("ships an English localization", () => {
      expect(manifest.languages.some((l) => l.lang === "en")).toBe(true);
    });

    it("every language entry has lang, name, and path", () => {
      for (const language of manifest.languages ?? []) {
        expect(language.lang).toBeTruthy();
        expect(language.name).toBeTruthy();
        expect(language.path).toBeTruthy();
      }
    });

    it("every declared language file is valid JSON nested under STARDICEBAR", () => {
      for (const language of manifest.languages ?? []) {
        const raw = fs.readFileSync(path.join(ROOT, language.path), "utf-8");
        const parsed = JSON.parse(raw);
        expect(parsed.STARDICEBAR).toBeDefined();
      }
    });
  });
});
