import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addLine, buildLine, cartTotals, defaultSelections, itemCount, setQuantity,
  toggleOption, unitPriceFor, validateSelections, MAX_QUANTITY_PER_LINE,
} from "./cart";
import { fixtureMenu } from "./fixture-menu";

const allItems = fixtureMenu.flatMap((c) => c.items);
const find = (name: string) => {
  const item = allItems.find((i) => i.name === name);
  if (!item) throw new Error(`missing fixture item ${name}`);
  return item;
};
const jollof = find("Jollof Rice with Grilled Chicken");
const [portion, extras, drink] = jollof.customization_groups;
const opt = (g: typeof portion, name: string) => g!.options.find((o) => o.name === name)!.id;

test("defaults pick the default option of required single groups", () => {
  const s = defaultSelections(jollof);
  assert.deepEqual(s[portion!.id], [opt(portion, "Regular")]);
  assert.deepEqual(s[extras!.id], []);
  assert.equal(validateSelections(jollof, s).length, 0);
});

test("price updates with every option", () => {
  let s = defaultSelections(jollof);
  assert.equal(unitPriceFor(jollof, s), 7500);
  s = toggleOption(portion!, s, opt(portion, "Large"));
  s = toggleOption(extras!, s, opt(extras, "Extra chicken"));
  s = toggleOption(extras!, s, opt(extras, "Boiled egg"));
  s = toggleOption(drink!, s, opt(drink, "Sobolo"));
  assert.equal(unitPriceFor(jollof, s), 7500 + 1500 + 2500 + 500 + 1500);
});

test("single group replaces; required single cannot be cleared", () => {
  let s = defaultSelections(jollof);
  s = toggleOption(portion!, s, opt(portion, "Large"));
  assert.deepEqual(s[portion!.id], [opt(portion, "Large")]);
  s = toggleOption(portion!, s, opt(portion, "Large"));
  assert.deepEqual(s[portion!.id], [opt(portion, "Large")]);
});

test("optional single group clears on second tap", () => {
  let s = defaultSelections(jollof);
  s = toggleOption(drink!, s, opt(drink, "Sobolo"));
  s = toggleOption(drink!, s, opt(drink, "Sobolo"));
  assert.deepEqual(s[drink!.id], []);
});

test("multiple group respects max_select", () => {
  const capped = { ...extras!, max_select: 2 };
  let s = defaultSelections(jollof);
  for (const o of capped.options) s = toggleOption(capped, s, o.id);
  assert.equal(s[capped.id]!.length, 2);
});

test("validation reports missing required choice", () => {
  const s = { ...defaultSelections(jollof), [portion!.id]: [] };
  const problems = validateSelections(jollof, s);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.groupId, portion!.id);
});

test("identical meals merge; different options stay separate", () => {
  const s = defaultSelections(jollof);
  let lines = addLine([], buildLine(jollof, s, 1, "", "a"));
  lines = addLine(lines, buildLine(jollof, s, 2, "", "b"));
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.quantity, 3);
  const large = toggleOption(portion!, s, opt(portion, "Large"));
  lines = addLine(lines, buildLine(jollof, large, 1, "", "c"));
  assert.equal(lines.length, 2);
  lines = addLine(lines, buildLine(jollof, s, 1, "No pepper", "d"));
  assert.equal(lines.length, 3);
  assert.equal(itemCount(lines), 5);
});

test("quantity is clamped and zero removes the line", () => {
  const s = defaultSelections(jollof);
  let lines = [buildLine(jollof, s, 1, "", "a")];
  lines = setQuantity(lines, "a", 999);
  assert.equal(lines[0]!.quantity, MAX_QUANTITY_PER_LINE);
  lines = setQuantity(lines, "a", 0);
  assert.equal(lines.length, 0);
});

test("cart totals apply tax and service charge", () => {
  const s = defaultSelections(jollof);
  const lines = [buildLine(jollof, s, 2, "", "a")];
  const t = cartTotals(lines, 1250, 500);
  assert.equal(t.subtotal, 15000);
  assert.equal(t.taxAmount, 1875);
  assert.equal(t.serviceCharge, 750);
  assert.equal(t.total, 17625);
});

test("fixture has unique ids", () => {
  const ids = allItems.flatMap((i) => [i.id, ...i.customization_groups.flatMap((g) => [g.id, ...g.options.map((o) => o.id)])]);
  assert.equal(new Set(ids).size, ids.length);
});
