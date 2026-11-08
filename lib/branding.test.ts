import { test } from "node:test";
import assert from "node:assert/strict";
import { BRAND_PRESETS, brandCss, checkBrand, contrast, mix } from "./branding";

test("every preset is readable", () => {
  for (const p of BRAND_PRESETS) assert.equal(checkBrand(p), null, p.name);
});
test("rejects colours that would be hard to read", () => {
  assert.match(checkBrand({ primary: "#f2f2f2", accent: "#f2b134" })!, /too light/);
  assert.match(checkBrand({ primary: "#16603a", accent: "#222222" })!, /too dark/);
  assert.match(checkBrand({ primary: "red", accent: "#f2b134" })!, /#RRGGBB/);
});
test("unreadable colours never reach the screen", () => {
  assert.match(brandCss({ primary: "#ffffff", accent: "#ffffff" }), /--color-palm:#16603a/);
});
test("contrast and mixing behave", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
});
