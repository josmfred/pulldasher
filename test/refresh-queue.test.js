import { test } from "node:test";
import assert from "node:assert/strict";
import {
  processIssueItem,
  processPullItem,
  makeQueueConsumer,
} from "../lib/refresh.js";

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

// Bulk pacing lives at the consumer: a work item awaits the pacer's slot before
// processing (the drain is where the API call spends quota), while the bare
// batch-done sentinel runs straight through, never gated. The item's onFailure
// is merged into the injected deps so it stays scoped to the run.
test("makeQueueConsumer gates a work item but never the batch-done sentinel", async () => {
  let gateCalls = 0;
  const pacer = {
    gate: () => {
      gateCalls++;
      return Promise.resolve();
    },
  };
  const processed = [];
  const consume = makeQueueConsumer(
    pacer,
    (response, next, deps) => {
      processed.push({ response, deps });
      next();
    },
    { parse: "injected-dep" }
  );

  let nextCalled = 0;
  const onFailure = () => {};
  await consume({ response: { number: 1 }, onFailure }, () => nextCalled++);
  assert.equal(gateCalls, 1);
  assert.equal(nextCalled, 1);
  assert.deepEqual(processed[0].response, { number: 1 });
  assert.equal(processed[0].deps.parse, "injected-dep");
  assert.equal(processed[0].deps.onFailure, onFailure);

  let sentinelRan = 0;
  await consume(() => sentinelRan++, () => nextCalled++);
  assert.equal(sentinelRan, 1);
  assert.equal(gateCalls, 1); // sentinel was not gated
  assert.equal(nextCalled, 2);
  assert.equal(processed.length, 1); // sentinel did not reach processItem
});
