const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const packageJsonPath = path.join(__dirname, `../package.json`);

const updateVersion = (versionIndex) => {
  const pkgJson = require(packageJsonPath);
  pkgJson.version = pkgJson.version
    .split(".")
    .map((item, index) => (index === versionIndex ? Number(item) + 1 : item))
    .join(".");
  return pkgJson;
};
function main() {
  if (process.env.DID_NOT_UPDATE) {
    return;
  }
  const type = process.env.COMMIT_MSG.split(":")[0];
  switch (type) {
    case "feat":
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(updateVersion(2), null, 2)
      );
      execSync(
        `git add . && DID_NOT_UPDATE=true git commit -m "${process.env.COMMIT_MSG}"`
      );
      break;
    case "perf":
    case "chore":
    case "fix":
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(updateVersion(2), null, 2)
      );
      execSync(
        `git add . && DID_NOT_UPDATE=true git commit -m "${process.env.COMMIT_MSG}"`
      );
      break;
  }
}
main();
