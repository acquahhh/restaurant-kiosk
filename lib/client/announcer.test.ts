import { test } from "node:test";
import assert from "node:assert/strict";
import { phraseFor } from "./announcer";

test("order numbers are spoken naturally", () => {
  assert.equal(phraseFor("042"), "Order 42, ready for collection.");
  assert.equal(phraseFor("007"), "Order 7, ready for collection.");
  assert.equal(phraseFor("120"), "Order 120, ready for collection.");
});
