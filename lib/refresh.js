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
 *
 * Single-item refreshes (webhooks, socket) have no end-of-run report, so no
 * failure collector is attached.
 */
function pushOnQueue(queue) {
  return function (githubResponse) {
    queue.push({ response: githubResponse, onFailure: null });
    return new Promise(function (resolve) {
      queue.push(resolve);
    });
  };
}

/**
 * Returns a function that will:
 *    push all the entries in the array (first argument) to the specified
 *    Queue and return a promise that is fulfilled when the items are fully
 *    processed.
 *
 * Each item carries the run's `onFailure` collector (null for single-item
 * webhook/socket refreshes), so a failed parse is recorded for that run's
 * end-of-run report.
 */
function pushAllOnQueue(queue, onFailure) {
  return function (githubResponses) {
    return new Promise(function (resolve) {
      githubResponses.forEach(function (githubResponse) {
        queue.push({ response: githubResponse, onFailure: onFailure });
      });
      queue.push(resolve);
    });
  };
}

/**
 * For the bulk bin scripts: at the end of a run, re-report everything that
 * failed — repos that couldn't be fetched, plus individual issues/pulls that
 * couldn't be refreshed — and flag a non-zero exit, so a partial backfill isn't
 * mistaken for a complete one. The per-failure lines were already logged inline
 * mid-run; repeating them at the end (one per line, greppable) keeps them from
 * getting buried under thousands of debug lines.
 */
export function reportFailures({ failedRepos, failedItems }) {
  failedItems = failedItems || [];
  failedRepos.forEach(function (repo) {
    console.error("Skipped repo (could not fetch): %s", repo);
  });
  failedItems.forEach(function (item) {
    console.error("Failed to refresh %s #%s", item.repo, item.number);
  });
  if (failedRepos.length || failedItems.length) {
    console.error(
      "Backfill incomplete: %s repo(s) skipped, %s item(s) failed (listed above).",
      failedRepos.length,
      failedItems.length
    );
    process.exitCode = 1;
  }
}

/**
 * Bridges a forEachRepo result onto a queue: pushes the fetched items, waits
 * for them to drain, then resolves to `{ failedRepos, failedItems }` so the
 * bulk bin scripts can report (and exit non-zero on) both repos that couldn't
 * be fetched and items that couldn't be refreshed. `failedItems` is local to
 * this drain, so the live server's webhook refreshes never accumulate here.
 */
function drainThrough(queue) {
  return function ({ items, failedRepos }) {
    const failedItems = [];
    const onFailure = function (repo, number) {
      failedItems.push({ repo: repo, number: number });
    };
    return pushAllOnQueue(queue, onFailure)(items).then(function () {
      return { failedRepos: failedRepos, failedItems: failedItems };
    });
  };
}

/**
 * Refresh one issue. Collaborators (including the run's `onFailure` collector)
 * are injected so the failure path is testable. A transient parse/update error
 * is logged, recorded via `onFailure` (when present), and swallowed — we still
 * call next() so one bad issue can't abort the sweep (or, at runtime, crash the
 * server on a webhook refresh).
 */
export function processIssueItem(
  response,
  next,
  { parseIssue, updateAllIssueData, onFailure }
) {
  refreshDebug("refreshing issue %s", response.number);
  return parseIssue(response)
    .then(updateAllIssueData)
    .then(function () {
      refreshDebug(
        "done refreshing issue %s in repo %s",
        response.number,
        response.repo
      );
      next();
    })
    .catch(function (err) {
      console.error(
        "Failed to refresh issue %s in repo %s: %s",
        response.number,
        response.repo,
        (err && err.message) || err
      );
      if (onFailure) {
        onFailure(response.repo, response.number);
      }
      next();
    });
}

/**
 * Refresh one pull. See processIssueItem.
 */
export function processPullItem(
  response,
  next,
  { parse, updateAllPullData, onFailure }
) {
  const repo =
    response.base && response.base.repo && response.base.repo.full_name;
  refreshDebug("refreshing pull %s in repo %s", response.number, repo);
  return parse(response)
    .then(updateAllPullData)
    .then(function () {
      refreshDebug("done refreshing pull %s", response.number);
      next();
    })
    .catch(function (err) {
      console.error(
        "Failed to refresh pull %s in repo %s: %s",
        response.number,
        repo,
        (err && err.message) || err
      );
      if (onFailure) {
        onFailure(repo, response.number);
      }
      next();
    });
}

// The queue holds two kinds of entries: a batch-done sentinel (the bare resolve
// function pushed after a batch, see pushAllOnQueue) and work items
// `{ response, onFailure }`. onFailure rides on the item rather than on the
// queue or the fixed pop deps, so it stays scoped to the run that enqueued it —
// a bulk run collects its own failures, while webhook/socket refreshes (which
// push onFailure null) don't accumulate. Unwrap so the process functions see
// one response plus their injected collaborators.
issueQueue.pop(function (item, next) {
  if (typeof item === "function") {
    item();
    return next();
  }
  processIssueItem(item.response, next, {
    parseIssue: gitManager.parseIssue,
    updateAllIssueData: dbManager.updateAllIssueData,
    onFailure: item.onFailure,
  });
});

pullQueue.pop(function (item, next) {
  if (typeof item === "function") {
    item();
    return next();
  }
  processPullItem(item.response, next, {
    parse: gitManager.parse,
    updateAllPullData: dbManager.updateAllPullData,
    onFailure: item.onFailure,
  });
});
