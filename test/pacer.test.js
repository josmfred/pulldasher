import { test } from "node:test";
import assert from "node:assert/strict";
import { computePace } from "../lib/pacer.js";

const NOW = 1_700_000_000_000; // fixed clock (ms); reset values are NOW-relative
const RESERVE = 1000;
const resetIn = (seconds) => NOW / 1000 + seconds;

// Before the first response is observed there's no quota view, so a bulk
// request must proceed immediately rather than stall forever.
test("computePace allows the request when quota is unknown", () => {
  const { delayMs } = computePace({
    remaining: null,
    reset: null,
    used: null,
    reserve: RESERVE,
    now: NOW,
    nextSlot: 0,
    lastUsed: null,
  });
  assert.equal(delayMs, 0);
});

// A reset timestamp in the past means the window already rolled over and our
// remaining is stale — allow the request and let the next response refresh it.
test("computePace allows the request when the reset window is stale", () => {
  const { delayMs } = computePace({
    remaining: 0,
    reset: resetIn(-10),
    used: 5000,
    reserve: RESERVE,
    now: NOW,
    nextSlot: 0,
    lastUsed: 4000,
  });
  assert.equal(delayMs, 0);
});

// At or below the reserve floor, bulk must pause until the quota refills so it
// stops competing with live traffic.
test("computePace pauses until reset when remaining is at or below the reserve", () => {
  const { delayMs, nextSlot } = computePace({
    remaining: 500,
    reset: resetIn(600),
    used: 4500,
    reserve: RESERVE,
    now: NOW,
    nextSlot: 0,
    lastUsed: 4490,
  });
  assert.equal(delayMs, 600_000);
  // The cursor jumps to the reset so post-refill pacing starts from the window edge.
  assert.equal(nextSlot, NOW + 600_000);
});

// The real first-gate state: page one was fetched un-paced, so the after-hook
// `observe` has already populated the quota view (remaining/reset/used) — but no
// prior gate has set a `used` baseline. With nothing to diff against, the gate
// can't know how much was spent yet, so it proceeds immediately and just records
// the baseline (returned as lastUsed) for the next gate.
test("computePace does not delay the first gate, but records the usage baseline", () => {
  const { delayMs, nextSlot, lastUsed } = computePace({
    remaining: 5000,
    reset: resetIn(3600),
    used: 100,
    reserve: RESERVE,
    now: NOW,
    nextSlot: 0,
    lastUsed: null,
  });
  assert.equal(delayMs, 0);
  assert.equal(nextSlot, NOW);
  assert.equal(lastUsed, 100);
});

// The cursor advances by the requests actually spent since the last gate, not
// by one per gate — so a multi-call item waits proportionally longer.
test("computePace advances the cursor by the requests spent since the last gate", () => {
  const params = {
    remaining: 1100, // budget 100
    reset: resetIn(100), // window 100_000ms → interval = 1000ms / request
    used: undefined, // set per case
    reserve: RESERVE,
    now: NOW,
    nextSlot: NOW,
    lastUsed: 1000,
  };

  const oneCall = computePace({ ...params, used: 1001 });
  assert.equal(oneCall.delayMs, 1000);

  const eightCalls = computePace({ ...params, used: 1008 });
  assert.equal(eightCalls.delayMs, 8000);
});
