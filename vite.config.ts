import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      include: ["lib/index.ts"],
      copyDtsFiles: true,
    }),
  ],
  build: {
    minify: "terser",
    lib: {
      entry: "./lib/index.ts",
      name: "WsConsole",
      fileName: "WsConsole",
    },
  },
});
