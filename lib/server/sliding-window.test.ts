import { test } from "node:test";
import assert from "node:assert/strict";
import { allow, resetForTests } from "./sliding-window";

test("allows up to the limit, then refuses", () => {
  resetForTests();
  for (let i = 0; i < 10; i++) assert.equal(allow("ip-a", 10, 60_000, 1000 + i), true);
  assert.equal(allow("ip-a", 10, 60_000, 2000), false);
});

test("limits are per device", () => {
  resetForTests();
  for (let i = 0; i < 10; i++) allow("ip-a", 10, 60_000, 1000);
  assert.equal(allow("ip-b", 10, 60_000, 1000), true);
});

test("the window slides: old attempts expire", () => {
  resetForTests();
  for (let i = 0; i < 10; i++) allow("ip-a", 10, 60_000, 0);
  assert.equal(allow("ip-a", 10, 60_000, 59_999), false);
  assert.equal(allow("ip-a", 10, 60_000, 60_000), true);
});
