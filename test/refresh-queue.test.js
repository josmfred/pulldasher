import { test } from "node:test";
import assert from "node:assert/strict";
import { processIssueItem, processPullItem } from "../lib/refresh.js";

// A transient failure parsing one item must not abort the sweep: the handler
// logs, records the failure via the injected onFailure, and still calls next()
// so the queue keeps draining.
test("processIssueItem records the failure and continues past a failing parse", async () => {
  let nextCalled = 0;
  const failures = [];
  const deps = {
    parseIssue: () => Promise.reject(new Error("transient 500")),
    updateAllIssueData: () => {
      throw new Error("updateAllIssueData should not run after a parse failure");
    },
    onFailure: (repo, number) => failures.push({ repo, number }),
  };

  await processIssueItem({ number: 7, repo: "test/repo-a" }, () => nextCalled++, deps);

  assert.equal(nextCalled, 1);
  assert.deepEqual(failures, [{ repo: "test/repo-a", number: 7 }]);
});

test("processPullItem records the failure and continues past a failing parse", async () => {
  let nextCalled = 0;
  const failures = [];
  const deps = {
    parse: () => Promise.reject(new Error("transient 502")),
    updateAllPullData: () => {
      throw new Error("updateAllPullData should not run after a parse failure");
    },
    onFailure: (repo, number) => failures.push({ repo, number }),
  };

  await processPullItem(
    { number: 9, base: { repo: { full_name: "test/repo-a" } } },
    () => nextCalled++,
    deps
  );

  assert.equal(nextCalled, 1);
  assert.deepEqual(failures, [{ repo: "test/repo-a", number: 9 }]);
});
