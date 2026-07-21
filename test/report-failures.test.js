import { test } from "node:test";
import assert from "node:assert/strict";
import { reportFailures } from "../lib/refresh.js";

// reportFailures mutates process.exitCode, so save/restore around each case.
test("reportFailures flags a non-zero exit when repos or items failed", () => {
  const prev = process.exitCode;
  process.exitCode = 0;
  reportFailures({
    failedRepos: ["owner/a"],
    failedItems: [{ repo: "owner/b", number: 7 }],
  });
  assert.equal(process.exitCode, 1);
  process.exitCode = prev;
});

test("reportFailures leaves the exit code alone on a clean run", () => {
  const prev = process.exitCode;
  process.exitCode = 0;
  reportFailures({ failedRepos: [], failedItems: [] });
  assert.equal(process.exitCode, 0);
  process.exitCode = prev;
});

test("reportFailures tolerates a missing failedItems", () => {
  const prev = process.exitCode;
  process.exitCode = 0;
  reportFailures({ failedRepos: [] });
  assert.equal(process.exitCode, 0);
  process.exitCode = prev;
});
