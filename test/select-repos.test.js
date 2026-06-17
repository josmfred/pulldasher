import { test } from "node:test";
import assert from "node:assert/strict";
import utils from "../lib/utils.js";

// Fixture config (test/fixtures/config.js) lists three repos.
test("selectRepos returns every configured repo when names are empty", () => {
  assert.equal(utils.selectRepos([]).length, 3);
  assert.equal(utils.selectRepos().length, 3);
});

test("selectRepos resolves names to their config repo objects", () => {
  const repos = utils.selectRepos(["test/repo-b"]);
  assert.equal(repos.length, 1);
  assert.equal(repos[0].name, "test/repo-b");
});

test("selectRepos throws listing every unconfigured repo", () => {
  assert.throws(
    () => utils.selectRepos(["test/repo-a", "test/nope-1", "test/nope-2"]),
    (err) => /not configured/i.test(err.message) &&
      err.message.includes("test/nope-1") &&
      err.message.includes("test/nope-2") &&
      !err.message.includes("test/repo-a")
  );
});
