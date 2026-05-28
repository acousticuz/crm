const fs = require("node:fs");
const path = require("node:path");

// Load .env into a plain object so pm2 can inject it into each app's process
// env. The telephony-worker reads process.env directly; the backend also
// self-loads .env via ConfigModule, so passing it here keeps them consistent.
// No secrets live in this file — they stay in the (git-ignored) .env.
function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const root = __dirname;
const env = loadEnv(path.join(root, ".env"));

module.exports = {
  apps: [
    {
      name: "acoustic-backend",
      cwd: path.join(root, "apps/backend"),
      script: "dist/main.js",
      env,
      autorestart: true,
      max_restarts: 20,
      time: true,
    },
    {
      // IMPORTANT: keep exactly ONE worker instance — a second AMI session on
      // the same manager account makes FreePBX drop both (connection flapping).
      name: "acoustic-worker",
      cwd: path.join(root, "apps/telephony-worker"),
      script: "dist/main.js",
      exec_mode: "fork",
      instances: 1,
      env,
      autorestart: true,
      max_restarts: 20,
      time: true,
    },
  ],
};
