import { defineConfig } from "@playwright/test";

// The backend allows http://localhost:3000, so the browser must use that host, not 127.0.0.1.
const WEB = "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: WEB, locale: "vi-VN" }, // the specs assert Vietnamese copy
  webServer: [
    {
      command: "uv run fastapi run app/main.py --host 127.0.0.1 --port 8000",
      cwd: "../backend",
      env: { ...(process.env as Record<string, string>), MOCK: "true" },
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm build && pnpm start",
      env: { ...(process.env as Record<string, string>), NEXT_PUBLIC_FIXTURES: "1" },
      url: WEB,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});
