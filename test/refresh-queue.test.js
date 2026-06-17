import { test } from "node:test";
import assert from "node:assert/strict";
import { processIssueItem, processPullItem } from "../lib/refresh.js";

// A transient failure parsing one item must not abort the sweep: the handler
// logs and still calls next() so the queue keeps draining.
test("processIssueItem continues past a failing parse", async () => {
  let nextCalled = 0;
  const deps = {
    parseIssue: () => Promise.reject(new Error("transient 500")),
    updateAllIssueData: () => {
      throw new Error("updateAllIssueData should not run after a parse failure");
    },
  };

  await processIssueItem({ number: 7, repo: "test/repo-a" }, () => nextCalled++, deps);

  assert.equal(nextCalled, 1);
});

test("processPullItem continues past a failing parse", async () => {
  let nextCalled = 0;
  const deps = {
    parse: () => Promise.reject(new Error("transient 502")),
    updateAllPullData: () => {
      throw new Error("updateAllPullData should not run after a parse failure");
    },
  };

  await processPullItem(
    { number: 9, base: { repo: { full_name: "test/repo-a" } } },
    () => nextCalled++,
    deps
  );

  assert.equal(nextCalled, 1);
});

test("processIssueItem runs a queued sentinel function and calls next", async () => {
  let sentinelCalled = 0;
  let nextCalled = 0;

  await processIssueItem(() => sentinelCalled++, () => nextCalled++, {});

  assert.equal(sentinelCalled, 1);
  assert.equal(nextCalled, 1);
});
