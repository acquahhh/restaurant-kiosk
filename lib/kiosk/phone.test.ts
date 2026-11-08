import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES } from "@/lib/countries";
import { formatPhone, guessNetwork, isValidPhone, providerCode } from "./phone";

test("Ghana (default) keeps its rules", () => {
  assert.ok(isValidPhone("0241234567"));
  assert.ok(!isValidPhone("241234567"));
  assert.equal(guessNetwork("0551234567"), "mtn");
  assert.equal(guessNetwork("0201234567"), "telecel");
  assert.equal(guessNetwork("0271234567"), "airteltigo");
  assert.equal(guessNetwork("0311234567"), null);
  assert.equal(formatPhone("02412"), "024 12");
  assert.equal(formatPhone("0241234567"), "024 123 4567");
  assert.equal(providerCode("telecel"), "vod");
});

test("Rwanda numbers and networks", () => {
  const RW = COUNTRIES.RW;
  assert.ok(isValidPhone("0781234567", RW));
  assert.ok(!isValidPhone("0241234567", RW));
  assert.equal(guessNetwork("0781234567", RW), "mtn");
  assert.equal(guessNetwork("0731234567", RW), "airtel");
  assert.equal(formatPhone("0781234567", RW), "078 123 4567");
});

test("Kenya numbers and networks", () => {
  const KE = COUNTRIES.KE;
  assert.ok(isValidPhone("0712345678", KE));
  assert.equal(guessNetwork("0712345678", KE), "mpesa");
  assert.equal(guessNetwork("0733345678", KE), "airtel");
  assert.equal(formatPhone("0712345678", KE), "0712 345 678");
});
