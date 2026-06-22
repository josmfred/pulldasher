import config from "./config-loader.js";
import debug from "./debug.js";
import Promise from "bluebird";

const pacerDebug = debug("pulldasher:pacer");

// Reserve a slice of the hourly quota for live (webhook/socket) traffic; bulk
// backfills pause rather than spend below it. See config.github.bulkReserve.
const reserve = config.github.bulkReserve ?? 1000;

// Only log a paced delay once it's long enough to explain a visibly slow
// backfill — short spacing isn't worth the noise.
const LOG_DELAY_THRESHOLD_MS = 5000;

/**
 * Proactively paces bulk GitHub requests so a backfill yields to live traffic
 * instead of draining the shared token's quota to zero. A single process-wide
 * instance: rate state is global to the token, so every bulk call gates against
 * the same view, fed by `observe` on every response (live calls included).
 *
 * `observe(headers)` — record the latest quota from any response (free).
 * `gate()` — await this before pushing a *bulk* item; it spreads bulk work
 *   across the reset window and blocks entirely while below the reserve floor.
 *
 * Pacing is calibrated by actual consumption, not by gate count: each gate
 * advances a token-bucket cursor by the number of requests spent since the last
 * gate (`x-ratelimit-used` delta), so a pull whose processing fans out to a
 * dozen calls correctly waits a dozen intervals — and a live-traffic spike,
 * which also bumps `used`, pushes the cursor out and makes bulk yield.
 */
const pacer = {
  remaining: null,
  reset: null,
  used: null,
  lastUsed: null,
  nextSlot: 0,

  observe: function (headers) {
    if (!headers) {
      return;
    }
    const remaining = headers["x-ratelimit-remaining"];
    const reset = headers["x-ratelimit-reset"];
    const used = headers["x-ratelimit-used"];
    if (remaining !== undefined) {
      this.remaining = Number(remaining);
    }
    if (reset !== undefined) {
      this.reset = Number(reset);
    }
    if (used !== undefined) {
      this.used = Number(used);
    }
  },

  gate: function () {
    const now = Date.now();
    const { delayMs, nextSlot, lastUsed } = computePace({
      remaining: this.remaining,
      reset: this.reset,
      used: this.used,
      reserve: reserve,
      now: now,
      nextSlot: this.nextSlot,
      lastUsed: this.lastUsed,
    });
    this.nextSlot = nextSlot;
    this.lastUsed = lastUsed;

    // The floor-pause is the only positive delay that isn't even-spread pacing.
    if (delayMs > 0 && this.remaining != null && this.remaining <= reserve) {
      pacerDebug(
        "bulk paused: remaining %s ≤ reserve %s, waiting %ss for quota reset",
        this.remaining,
        reserve,
        Math.round(delayMs / 1000)
      );
    } else if (delayMs >= LOG_DELAY_THRESHOLD_MS) {
      pacerDebug(
        "pacing bulk: waiting %sms (remaining %s)",
        Math.round(delayMs),
        this.remaining
      );
    }

    return Promise.delay(delayMs);
  },
};

export default pacer;

/**
 * Pure pacing decision. Given the latest quota view and a token-bucket cursor,
 * returns how long the next bulk request should wait, the advanced cursor, and
 * the `used` baseline to diff against next time.
 *
 *   - unknown quota, or a `reset` already in the past (stale window) → allow
 *     immediately; the next response refreshes the view.
 *   - `remaining ≤ reserve` → pause until `reset` (let the window refill).
 *   - otherwise → even-spread: the spendable budget (`remaining − reserve`)
 *     divided across the time left in the window gives the per-request interval.
 *     Advance the cursor by `spent × interval`, where `spent` is the requests
 *     consumed since the last gate (`used − lastUsed`), so the spacing tracks
 *     real consumption — a multi-call item or a live spike pushes the next slot
 *     further out. A shrinking `remaining` also widens the interval, so bulk
 *     yields on both signals.
 */
export function computePace({
  remaining,
  reset,
  used,
  reserve,
  now,
  nextSlot,
  lastUsed,
}) {
  const baseline = used ?? lastUsed;
  // No quota view, or a window that already rolled over (our `remaining` is
  // stale): proceed now and let the next response refresh the view.
  const allowNow = { delayMs: 0, nextSlot: now, lastUsed: baseline };
  if (remaining == null || reset == null) {
    return allowNow;
  }
  const resetMs = reset * 1000;
  if (resetMs <= now) {
    return allowNow;
  }
  if (remaining <= reserve) {
    return { delayMs: resetMs - now, nextSlot: resetMs, lastUsed: baseline };
  }
  const interval = (resetMs - now) / (remaining - reserve);
  // Clamp at 0: across a window rollover the server resets `used` to ~0 while
  // our `lastUsed` still holds the pre-reset high, so the delta can go negative.
  const spent =
    used == null || lastUsed == null ? 0 : Math.max(0, used - lastUsed);
  const slot = Math.max(now, nextSlot + spent * interval);
  return { delayMs: slot - now, nextSlot: slot, lastUsed: baseline };
}
