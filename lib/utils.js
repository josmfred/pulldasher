import config from './config-loader.js';
import Bluebird from 'bluebird';
import _ from 'underscore';

const Promise = global.Promise;

// Set the global Promise object up with the done method
Promise.prototype.done = function (callback) {
   return Bluebird.cast(this).done(callback);
};

export default {
   /**
    * Converts `t` to a Unix timestamp from a Date object unless it's already
    * a number.
    */
   toUnixTime: function (date) {
      const type = typeof date;
      if (!date || type == 'number') {
         return date;
      }
      if (type === 'object') {
         return date.getTime() / 1000;
      }
      if (type === 'string') {
         return Date.parse(date) / 1000;
      }
      return date;
   },

   /**
    * Converts `t` to a Date object from a Unix timestamp unless it's not a
    * number.
    */
   fromUnixTime: function (t) {
      return typeof t === 'number' ? new Date(t * 1000) : t;
   },

   /**
    * Converts `str` to a Date object from a Date string (or null).
    * Returns null if str is falsy.
    */
   fromDateString: function (str) {
      return str ? (str instanceof Date ? str : new Date(str)) : null;
   },

   /**
    * Resolve a list of repo names to their `config.repos` entries (preserving
    * each repo's config, e.g. requiredStatuses). Empty/omitted names → all
    * configured repos. Throws on a name that isn't configured, since pulldasher
    * only tracks configured repos.
    */
   selectRepos: function (names) {
      if (!names || !names.length) {
         return config.repos;
      }
      const byName = _.indexBy(config.repos, 'name');
      const unknown = _.difference(names, _.keys(byName));
      if (unknown.length) {
         throw new Error('Repos not configured: ' + unknown.join(', '));
      }
      return names.map(function (name) {
         return byName[name];
      });
   },

   /**
    * Run `singleRepoLambda(repoName)` for each repo and collect the results.
    * `repos` is the list of repos to run over (defaults to all configured repos
    * — pass a subset from selectRepos to target specific repos for manual QA or
    * failure recovery).
    *
    * Resolves to `{ items, failedRepos }`: the flattened values from the repos
    * that succeeded, plus the names of any that rejected. We use allSettled
    * rather than Promise.all so one repo's transient failure (e.g. a 502 deep in
    * a paginated list) doesn't abort the whole sweep — the caller decides how to
    * report `failedRepos`.
    */
   forEachRepo: function (singleRepoLambda, { repos = config.repos } = {}) {
      const promises = repos.map(function (currentRepo) {
         return singleRepoLambda(currentRepo.name);
      });
      return Promise.allSettled(promises).then(function (results) {
         const repoItems = [];
         const failedRepos = [];
         results.forEach(function (result, i) {
            if (result.status === 'fulfilled') {
               repoItems.push(result.value);
            } else {
               const repoName = repos[i].name;
               failedRepos.push(repoName);
               console.error(
                  'forEachRepo: failed to fetch repo %s: %s',
                  repoName,
                  (result.reason && result.reason.message) || result.reason
               );
            }
         });
         return {
            items: _.flatten(repoItems, /* shallow */ true),
            failedRepos: failedRepos,
         };
      });
   },

   /**
    * Statuses and checks have slightly different status names. Let's map the
    * check values to match the status values.
    */
   mapCheckToStatus: function (status) {
      switch (status) {
         case 'in_progress':
         case 'queued':
            return 'pending';
         case 'success':
         case 'skipped':
            return 'success';
         case 'failure':
         case 'cancelled':
         case 'timed_out':
         case 'startup_failure':
            return 'failure';
         default:
            return 'error';
      }
   },
};
