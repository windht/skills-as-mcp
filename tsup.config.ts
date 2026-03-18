import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    bin: "src/bin.ts",
    index: "src/index.ts"
  },
  format: ["esm"],
  target: "node20",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  outDir: "dist"
});
