import { test } from "node:test";
import assert from "node:assert/strict";
import { openState } from "./opening-hours";

const hours = { mon: { open: "08:00", close: "22:00" }, tue: { open: "08:00", close: "22:00" }, sun: null, sat: { open: "18:00", close: "02:00" } };
// 2026-11-09 is a Monday
test("open during hours", () => assert.deepEqual(openState(hours, new Date("2026-11-09T12:00:00Z")), { open: true }));
test("before opening says today", () => assert.deepEqual(openState(hours, new Date("2026-11-09T06:30:00Z")), { open: false, opensAt: "today at 08:00" }));
test("after closing says tomorrow", () => assert.deepEqual(openState(hours, new Date("2026-11-09T22:30:00Z")), { open: false, opensAt: "tomorrow at 08:00" }));
test("closing after midnight", () => assert.deepEqual(openState(hours, new Date("2026-11-14T23:30:00Z")), { open: true }));
test("closed day skips ahead", () => assert.deepEqual(openState(hours, new Date("2026-11-15T12:00:00Z")), { open: false, opensAt: "tomorrow at 08:00" }));
test("no hours means always open", () => assert.equal(openState({}), null));
