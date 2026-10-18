import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Next turns an imported image into { src, width, height }; Vite would give a bare URL string.
      name: "next-static-image",
      enforce: "pre",
      load(id) {
        if (/\.(png|jpe?g|webp|svg)$/.test(id.split("?")[0])) {
          return `export default { src: ${JSON.stringify(id)}, width: 100, height: 100 };`;
        }
      },
    },
  ],
  resolve: {
    // Same alias as tsconfig "paths".
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
