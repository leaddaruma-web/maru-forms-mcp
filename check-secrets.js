#!/usr/bin/env node
// Pre-commit check: đảm bảo credentials.json và token.json không bị stage vào git.
import { execSync } from "node:child_process";

const staged = execSync("git diff --cached --name-only", { encoding: "utf8" });
const blocked = ["credentials.json", "token.json", "client_secret.json"];
const found = blocked.filter((f) => staged.split("\n").some((line) => line.trim().endsWith(f)));

if (found.length > 0) {
  console.error("\n🚫 BLOCKED: Không được commit file chứa secrets:");
  found.forEach((f) => console.error(`   - ${f}`));
  console.error("\nUnstage bằng: git reset HEAD " + found.join(" ") + "\n");
  process.exit(1);
}
