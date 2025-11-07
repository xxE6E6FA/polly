import { $ } from "bun";

console.log("🚀 Starting Polly development servers...");

const convexProc = Bun.spawn(["bun", "run", "dev:convex"], {
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
  },
});

const frontendProc = Bun.spawn(["bun", "run", "dev:frontend"], {
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
  },
});

const handleExit = (signal: string) => {
  console.log(`\n📦 Shutting down development servers (${signal})...`);
  convexProc.kill();
  frontendProc.kill();
};

process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));

const [convexResult, frontendResult] = await Promise.all([
  convexProc.exited,
  frontendProc.exited,
]);

if (convexResult !== 0 || frontendResult !== 0) {
  console.error("❌ Development server exited with error");
  process.exit(1);
}
