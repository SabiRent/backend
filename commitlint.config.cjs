module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // new feature
        "fix", // bug fix
        "chore", // maintenance, deps, tooling
        "docs", // documentation
        "style", // formatting, no logic change
        "refactor", // restructure, no feature or fix
        "perf", // performance improvement
        "test", // adding or fixing tests
        "build", // build system changes
        "ci", // CI config changes
        "revert", // reverting a commit
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 200],
  },
};
