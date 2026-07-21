import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CONFIG_PATH = "../test/test-config.js";

const Signature = (await import("../models/signature.js")).default;

const reviewUser = { id: 1, login: "reviewer" };
const repo = "owner/repo";
const number = 42;

test("parseReview creates CR signature from APPROVED review with empty body", () => {
  const signatures = Signature.parseReview(
    {
      id: 100,
      body: "",
      state: "APPROVED",
      user: reviewUser,
      submitted_at: "2024-01-01T00:00:00Z",
    },
    repo,
    number
  );

  assert.equal(signatures.length, 1);
  assert.equal(signatures[0].data.type, "CR");
  assert.equal(signatures[0].data.comment_id, 100);
  assert.equal(signatures[0].data.user.login, "reviewer");
  // Flagged so git-manager exempts it from the commit-date staleness check,
  // letting an approval carry over a clean master merge.
  assert.equal(signatures[0].data.fromGithubApproval, true);
});

test("parseReview creates CR signature from lowercase webhook approved state", () => {
  // The `pull_request_review` webhook sends `state: "approved"` (lowercase),
  // unlike the REST API's `"APPROVED"`. Both must produce a CR signature.
  const signatures = Signature.parseReview(
    {
      id: 103,
      body: "",
      state: "approved",
      user: reviewUser,
      submitted_at: "2024-01-01T00:00:00Z",
    },
    repo,
    number
  );

  assert.equal(signatures.length, 1);
  assert.equal(signatures[0].data.type, "CR");
  assert.equal(signatures[0].data.fromGithubApproval, true);
});

test("parseReview keeps single CR signature when body already contains CR tag", () => {
  const signatures = Signature.parseReview(
    {
      id: 101,
      body: "CR :thumbsup:",
      state: "APPROVED",
      user: reviewUser,
      submitted_at: "2024-01-01T00:00:00Z",
    },
    repo,
    number
  );

  assert.equal(signatures.length, 1);
  assert.equal(signatures[0].data.type, "CR");
  // The CR came from the emoji tag, not the native approval, so it is NOT
  // exempt from the staleness check — new commits should still invalidate it.
  assert.equal(signatures[0].data.fromGithubApproval, false);
});

test("parseReview ignores CHANGES_REQUESTED reviews", () => {
  const signatures = Signature.parseReview(
    {
      id: 102,
      body: "Please fix this",
      state: "CHANGES_REQUESTED",
      user: reviewUser,
      submitted_at: "2024-01-01T00:00:00Z",
    },
    repo,
    number
  );

  assert.equal(signatures.length, 0);
});
