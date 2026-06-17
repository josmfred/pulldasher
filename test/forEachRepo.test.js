import { test } from "node:test";
import assert from "node:assert/strict";
import utils from "../lib/utils.js";

// Fixture config (test/fixtures/config.js) lists three repos.
test("forEachRepo isolates a failing repo and reports it in failedRepos", async () => {
  const failing = "test/repo-b";
  const lambda = (repo) =>
    repo === failing
      ? Promise.reject(new Error("transient 502"))
      : Promise.resolve([{ repo }]);

  const { items, failedRepos } = await utils.forEachRepo(lambda);

  assert.deepEqual(failedRepos, [failing]);
  assert.deepEqual(
    items.map((i) => i.repo).sort(),
    ["test/repo-a", "test/repo-c"]
  );
});

test("forEachRepo returns empty failedRepos when every repo succeeds", async () => {
  const lambda = (repo) => Promise.resolve([{ repo }]);

  const { items, failedRepos } = await utils.forEachRepo(lambda);

  assert.deepEqual(failedRepos, []);
  assert.equal(items.length, 3);
});

test("forEachRepo restricts to an explicit repo subset", async () => {
  const seen = [];
  const lambda = (repo) => {
    seen.push(repo);
    return Promise.resolve([{ repo }]);
  };

  const subset = utils.selectRepos(["test/repo-a", "test/repo-c"]);
  const { items, failedRepos } = await utils.forEachRepo(lambda, { repos: subset });

  assert.deepEqual(seen.sort(), ["test/repo-a", "test/repo-c"]);
  assert.deepEqual(failedRepos, []);
  assert.equal(items.length, 2);
});
