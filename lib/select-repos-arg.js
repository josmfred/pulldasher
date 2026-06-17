import path from "path";
import utils from "./utils.js";

/**
 * Resolve repo-name CLI args (after the script name) to config repo objects for
 * the bulk refresh bins. No args → all configured repos. An unconfigured name
 * prints a usage line and exits non-zero, so a typo can't silently no-op a
 * targeted QA / recovery run.
 */
export default function selectReposArg() {
  try {
    return utils.selectRepos(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error("Usage: %s [owner/repo ...]", path.basename(process.argv[1]));
    process.exit(2);
  }
}
