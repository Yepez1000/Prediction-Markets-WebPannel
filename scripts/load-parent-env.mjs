import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";

const workingDirectory = process.cwd();
const suppliedEnvironment = { ...process.env };
let directory = dirname(workingDirectory);

// Worktrees deliberately do not contain secrets. Locate the first shared .env
// in an ancestor directory, rather than depending on the current .dmux layout.
while (directory !== dirname(directory)) {
  const environmentFile = resolve(directory, ".env");

  if (existsSync(environmentFile)) {
    config({ path: environmentFile });
    break;
  }

  directory = dirname(directory);
}

// A worktree-local .env remains available for intentional per-worktree
// overrides. dotenv does not replace variables supplied by the shell.
const localEnvironmentFile = resolve(workingDirectory, ".env");
if (existsSync(localEnvironmentFile)) {
  config({ path: localEnvironmentFile, override: true });
}

// Explicit shell values always win over files, including worktree overrides.
Object.assign(process.env, suppliedEnvironment);
