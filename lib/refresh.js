import gitManager from "./git-manager.js";
import dbManager from "./db-manager.js";
import utils from "./utils.js";
import NotifyQueue from "notify-queue";
import debug from "./debug.js";
import Promise from "bluebird";

// Queues for making all refreshes be synchronous, one at a time.
var issueQueue = new NotifyQueue();
var pullQueue = new NotifyQueue();

const refreshDebug = debug("pulldasher:refresh");

export default {
  ///////   Issues   /////////

  issue: function refreshIssue(repo, number) {
    refreshDebug("refresh issue %s", number);
    return gitManager.getIssue(repo, number).then(pushOnQueue(issueQueue));
  },

  allIssues: function refreshAllIssues(repos) {
    refreshDebug("refresh all issues");
    return utils
      .forEachRepo(gitManager.getAllIssues, { repos: repos })
      .then(drainThrough(issueQueue));
  },

  openIssues: function refreshOpenIssues(repos) {
    refreshDebug("refresh all open issues");
    return utils
      .forEachRepo(gitManager.getOpenIssues, { repos: repos })
      .then(drainThrough(issueQueue));
  },

  ///////   Pulls   /////////

  pull: function refreshPull(repo, number) {
    refreshDebug("refresh pull %s", number);
    return gitManager.getPull(repo, number).then(pushOnQueue(pullQueue));
  },

  allPulls: function refreshAllPulls(repos) {
    refreshDebug("refresh all pull");
    return utils
      .forEachRepo(gitManager.getAllPulls, { repos: repos })
      .then(drainThrough(pullQueue));
  },

  openPulls: function refreshOpenPulls(repos) {
    refreshDebug("refresh all open pulls");
    return utils
      .forEachRepo(gitManager.getOpenPulls, { repos: repos })
      .then(drainThrough(pullQueue));
  },
};

/**
 * Returns a function that will:
 *    push its first argument to the specified Queue
 *    and return a promise that is fulfilled when the item is fully processed.
 */
function pushOnQueue(queue) {
  return function (githubResponse) {
    queue.push(githubResponse);
    return new Promise(function (resolve) {
      queue.push(resolve);
    });
  };
}

/**
 * Returns a function that will:
 *    push all the entries in the array (first argument) to the sppecified
 *    Queue and return a promise that is fulfilled when the items are fully
 *    processed.
 */
function pushAllOnQueue(queue) {
  return function (githubResponses) {
    return new Promise(function (resolve) {
      githubResponses.forEach(function (githubResponse) {
        queue.push(githubResponse);
      });
      queue.push(resolve);
    });
  };
}

/**
 * For the bulk bin scripts: log any repos that couldn't be fetched and flag a
 * non-zero exit, so a partial backfill (e.g. one repo down on transient errors)
 * isn't mistaken for a complete one.
 */
export function reportFailedRepos({ failedRepos }) {
  if (failedRepos.length) {
    // One repo per line so the skipped set is greppable in the container logs.
    failedRepos.forEach(function (repo) {
      console.error("Skipped repo (could not fetch): %s", repo);
    });
    process.exitCode = 1;
  }
}

/**
 * Bridges a forEachRepo result onto a queue: pushes the fetched items, waits
 * for them to drain, then resolves to `{ failedRepos }` so the bulk bin scripts
 * can report (and exit non-zero on) repos that couldn't be fetched.
 */
function drainThrough(queue) {
  return function ({ items, failedRepos }) {
    return pushAllOnQueue(queue)(items).then(function () {
      return { failedRepos };
    });
  };
}

/**
 * Process one item off the issue queue. Dependencies are injected so the
 * failure path is testable. A transient parse/update error is logged and
 * swallowed — we still call next() so one bad issue can't abort the sweep (or,
 * at runtime, crash the server on a webhook-driven refresh).
 */
export function processIssueItem(githubIssue, next, { parseIssue, updateAllIssueData }) {
  // Allow callers to push functions on the queue to signal when an item has
  // made it through
  if (typeof githubIssue === "function") {
    githubIssue();
    return next();
  }
  refreshDebug("refreshing issue %s", githubIssue.number);
  return parseIssue(githubIssue)
    .then(updateAllIssueData)
    .then(function () {
      refreshDebug(
        "done refreshing issue %s in repo %s",
        githubIssue.number,
        githubIssue.repo
      );
      next();
    })
    .catch(function (err) {
      console.error(
        "Failed to refresh issue %s in repo %s: %s",
        githubIssue.number,
        githubIssue.repo,
        (err && err.message) || err
      );
      next();
    });
}

/**
 * Process one item off the pull queue. See processIssueItem.
 */
export function processPullItem(githubPull, next, { parse, updateAllPullData }) {
  // Allow callers to push functions on the queue to signal when an item has
  // made it through
  if (typeof githubPull === "function") {
    githubPull();
    return next();
  }
  var repo =
    githubPull.base && githubPull.base.repo && githubPull.base.repo.full_name;
  refreshDebug("refreshing pull %s in repo %s", githubPull.number, repo);
  return parse(githubPull)
    .then(updateAllPullData)
    .then(function () {
      refreshDebug("done refreshing pull %s", githubPull.number);
      next();
    })
    .catch(function (err) {
      console.error(
        "Failed to refresh pull %s in repo %s: %s",
        githubPull.number,
        repo,
        (err && err.message) || err
      );
      next();
    });
}

issueQueue.pop(function (githubIssue, next) {
  processIssueItem(githubIssue, next, {
    parseIssue: gitManager.parseIssue,
    updateAllIssueData: dbManager.updateAllIssueData,
  });
});

pullQueue.pop(function (githubPull, next) {
  processPullItem(githubPull, next, {
    parse: gitManager.parse,
    updateAllPullData: dbManager.updateAllPullData,
  });
});
