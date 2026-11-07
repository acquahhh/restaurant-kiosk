import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, guessNetwork, isValidGhanaPhone } from "./phone";

test("validates Ghana mobile numbers", () => {
  assert.ok(isValidGhanaPhone("0241234567"));
  assert.ok(isValidGhanaPhone("0501234567"));
  assert.ok(!isValidGhanaPhone("241234567"));
  assert.ok(!isValidGhanaPhone("02412345678"));
  assert.ok(!isValidGhanaPhone("0141234567"));
});

test("guesses network from prefix", () => {
  assert.equal(guessNetwork("0551234567"), "mtn");
  assert.equal(guessNetwork("0201234567"), "telecel");
  assert.equal(guessNetwork("0271234567"), "airteltigo");
  assert.equal(guessNetwork("0311234567"), null);
});

test("formats partial and full numbers", () => {
  assert.equal(formatPhone("024"), "024");
  assert.equal(formatPhone("02412"), "024 12");
  assert.equal(formatPhone("0241234567"), "024 123 4567");
});
