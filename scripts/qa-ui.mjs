import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.QA_UI_PORT || 3100);
const baseUrl = `http://${host}:${port}`;
const outputDir = path.resolve("test-results", "ui");
const toolRoot = path.resolve(".qa-tools", "playwright-1.53.0");
const playwrightCli = path.join(toolRoot, "node_modules", "playwright", "cli.js");
const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
const isWindows = process.platform === "win32";
const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let executable = command;
    let executableArgs = args;

    if (isWindows && command.endsWith(".cmd")) {
      const quote = (value) => `"${String(value).replace(/"/g, '\\"')}"`;
      executable = "cmd.exe";
      executableArgs = ["/d", "/s", "/c", [quote(command), ...args.map(quote)].join(" ")];
    }

    const child = spawn(executable, executableArgs, {
      shell: false,
      stdio: options.stdio || "inherit",
      env: { ...process.env, ...options.env },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function startServer() {
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", host, "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      BROWSER: "none",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  return child;
}

async function waitForServer(timeoutMs = 120000) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${baseUrl}: ${lastError?.message || "no response"}`);
}

async function ensurePlaywrightCli() {
  try {
    await stat(playwrightCli);
    return;
  } catch {
    // First run only: install the pinned CLI into an ignored tool cache.
  }

  await mkdir(toolRoot, { recursive: true });
  console.log(`[qa-ui] Installing playwright@1.53.0 into ${toolRoot}`);
  await run(process.execPath, [npmCli, "install", "--prefix", toolRoot, "--no-save", "--ignore-scripts", "playwright@1.53.0"], {
    env: {
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    },
  });
}

async function screenshotWithChannel(channel, name, viewport) {
  const filePath = path.join(outputDir, name);

  await run(process.execPath, [
    playwrightCli,
    "screenshot",
    "--browser=chromium",
    `--channel=${channel}`,
    `--viewport-size=${viewport}`,
    "--wait-for-timeout=2000",
    baseUrl,
    filePath,
  ]);

  const info = await stat(filePath);
  if (info.size < 1024) {
    throw new Error(`Screenshot is unexpectedly small: ${filePath}`);
  }

  return filePath;
}

async function capture(name, viewport) {
  const errors = [];

  for (const channel of ["msedge", "chrome"]) {
    try {
      const filePath = await screenshotWithChannel(channel, name, viewport);
      console.log(`[qa-ui] ${name} captured with ${channel}: ${filePath}`);
      return;
    } catch (error) {
      errors.push(`${channel}: ${error.message}`);
    }
  }

  throw new Error(`Unable to capture ${name}. Tried installed Edge and Chrome.\n${errors.join("\n")}`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await ensurePlaywrightCli();

  const server = startServer();
  let stopping = false;

  const stopServer = () => {
    if (stopping || server.exitCode !== null) return;
    stopping = true;
    if (isWindows) {
      spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
  };

  process.on("SIGINT", () => {
    stopServer();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stopServer();
    process.exit(143);
  });

  try {
    await waitForServer();
    await capture("mobile-390x844.png", "390,844");
    await capture("desktop-1280x900.png", "1280,900");
    console.log(`[qa-ui] Screenshots saved in ${outputDir}`);
  } finally {
    stopServer();
  }
}

main().catch((error) => {
  console.error(`[qa-ui] ${error.stack || error.message}`);
  process.exit(1);
});
