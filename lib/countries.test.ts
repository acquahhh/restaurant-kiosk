import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, getCountry } from "./countries";

test("phone formats per country", () => {
  assert.ok(COUNTRIES.GH.phone.pattern.test("0241234567"));
  assert.ok(COUNTRIES.RW.phone.pattern.test("0781234567"));
  assert.ok(COUNTRIES.RW.phone.pattern.test("0721234567"));
  assert.ok(!COUNTRIES.RW.phone.pattern.test("0241234567"));
  assert.ok(COUNTRIES.KE.phone.pattern.test("0712345678"));
  assert.ok(COUNTRIES.KE.phone.pattern.test("0110123456"));
  assert.ok(!COUNTRIES.KE.phone.pattern.test("0241234567"));
});

test("every network prefix matches its country's phone format", () => {
  for (const c of Object.values(COUNTRIES)) {
    for (const n of c.mobileMoney.networks) for (const p of n.prefixes) {
      const sample = (p + "1234567890").slice(0, c.phone.groups.reduce((a, b) => a + b, 0));
      assert.ok(c.phone.pattern.test(sample), `${c.code} ${n.id} ${p} -> ${sample}`);
    }
  }
});

test("unknown or missing country falls back to Ghana", () => {
  assert.equal(getCountry(undefined).code, "GH");
  assert.equal(getCountry("xx").code, "GH");
  assert.equal(getCountry("rw").code, "RW");
});

test("Rwandan franc has no minor unit", () => {
  assert.equal(COUNTRIES.RW.currency.exponent, 0);
  assert.equal(COUNTRIES.GH.currency.exponent, 2);
});
