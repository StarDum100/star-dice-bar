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
  });
});
