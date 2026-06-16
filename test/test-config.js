var emoji =
  "(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])";
var emojiText = ":[^\n:]+:";
var signature = "(" + emojiText + "|" + emoji + ")";

export default {
  useGithubApprovalForCr: true,
  repos: ["owner/repo"],
  tags: [
    {
      name: "CR",
      regex: new RegExp("\\bCR " + signature, "i"),
    },
    {
      name: "QA",
      regex: new RegExp("\\bQA " + signature, "i"),
    },
  ],
};
