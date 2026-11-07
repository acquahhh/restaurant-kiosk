import { test } from "node:test";
import assert from "node:assert/strict";
import { formatGhs, parseGhs, applyBasisPoints, computeTotals } from "./money";

test("formats pesewas as cedis", () => {
  assert.equal(formatGhs(7500), "GH₵ 75.00");
  assert.equal(formatGhs(800), "GH₵ 8.00");
  assert.equal(formatGhs(123456), "GH₵ 1,234.56");
});

test("parses cedi strings to pesewas", () => {
  assert.equal(parseGhs("75"), 7500);
  assert.equal(parseGhs("75.5"), 7550);
  assert.equal(parseGhs("GH₵ 12.34"), 1234);
  assert.throws(() => parseGhs("12.345"));
});

test("applies basis points with half-up rounding", () => {
  assert.equal(applyBasisPoints(7500, 1250), 938);
  assert.equal(applyBasisPoints(10000, 0), 0);
});

test("computes order totals", () => {
  const t = computeTotals([7500, 1500], 1250, 500);
  assert.equal(t.subtotal, 9000);
  assert.equal(t.taxAmount, 1125);
  assert.equal(t.serviceCharge, 450);
  assert.equal(t.total, 10575);
});
