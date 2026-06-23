import config from "../lib/config-loader.js";
import getLogin from "../lib/get-user-login.js";
import getUserid from "../lib/get-user-id.js";
import utils from "../lib/utils.js";

/**
 * A block or signoff in a comment.
 */
function Signature(data) {
  this.data = {
    repo: data.repo,
    number: data.number,
    user: {
      id: getUserid(data.user),
      login: getLogin(data.user),
    },
    type: data.type,
    created_at: utils.fromDateString(data.created_at),
    active: data.active,
    comment_id: data.comment_id,
    // True only for a CR signature synthesized from a GitHub native
    // "Approve" review (not an emoji `CR` tag). GitHub is the source of
    // truth for whether such an approval is still valid, so it is exempt
    // from the "stale after the last commit" check (see git-manager).
    // In-memory only; not persisted to the DB.
    fromGithubApproval: data.fromGithubApproval === true,
  };
}

/**
 * Parses a GitHub comment and returns an array of Signature objects.
 * Returns an empty array if the comment did not contain any of our tags.
 */
Signature.parseComment = function parseComment(
  comment,
  repoFullName,
  pullNumber
) {
  const commentData = {
    repo: repoFullName,
    number: pullNumber,
    body: comment.body,
    user: comment.user,
    created_at: comment.created_at,
    id: comment.id,
  };

  return parseSignatures(commentData);
};

/**
 * Parses a GitHub review and returns an array of Signature objects.
 * Returns an empty array if the comment did not contain any of our tags.
 */
Signature.parseReview = function parseReview(review, repoFullName, pullNumber) {
  const reviewData = {
    repo: repoFullName,
    number: pullNumber,
    body: review.body,
    user: review.user,
    created_at: review.submitted_at,
    id: review.id,
    state: review.state,
  };

  const signatures = parseSignatures(reviewData);

  // A GitHub "Approve" review counts as a CR signoff even without a
  // `CR :emoji:` tag in the body. Skip if the body already produced one.
  if (
    useGithubApprovalForCr() &&
    review.state === "APPROVED" &&
    !signatures.some((sig) => sig.data.type === "CR")
  ) {
    signatures.push(
      new Signature({
        repo: repoFullName,
        number: pullNumber,
        user: review.user,
        type: "CR",
        created_at: review.submitted_at,
        active: true,
        comment_id: review.id,
        fromGithubApproval: true,
      })
    );
  }

  return signatures;
};

function parseSignatures(data) {
  let signatures = [];

  config.tags.forEach(function (tag) {
    if (hasTag(data.body, tag)) {
      signatures.push(
        new Signature({
          repo: data.repo,
          number: data.number,
          user: {
            id: getUserid(data.user),
            login: getLogin(data.user),
          },
          type: tag.name,
          created_at: data.created_at,
          active: true,
          comment_id: data.id,
        })
      );
    }
  });

  return signatures;
}

/**
 * Takes an object representing a DB row, and returns an instance of this
 * Signature object.
 */
Signature.getFromDB = function (data) {
  var sig = new Signature({
    repo: data.repo,
    number: data.number,
    user: {
      id: data.userid,
      login: data.user,
    },
    type: data.type,
    created_at: utils.fromUnixTime(data.date),
    active: data.active,
    comment_id: data.comment_id,
  });

  return sig;
};

/**
 * A compare function for Signatures that can be passed to a custom sorter.
 * Sorts signatures in chronologically
 */
Signature.compare = function (a, b) {
  return Date.parse(a.data.created_at) - Date.parse(b.data.created_at);
};

function hasTag(body, tag) {
  return tag.regex.test(body || "");
}

function useGithubApprovalForCr() {
  return config.useGithubApprovalForCr !== false;
}

export default Signature;
