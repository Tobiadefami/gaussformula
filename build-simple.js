// A simple build script to bundle HyperFormula with esbuild
const { build } = require("esbuild");
const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "dist");

// Make sure dist directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/hyperformula.js",
  format: "cjs",
  platform: "node",
  target: "es2018",
  sourcemap: true,
  external: ["chevrotain"],
  tsconfig: "tsconfig.json",
  // This tells esbuild to ignore TypeScript type errors during bundling
  logLevel: "info",
})
  .then(() => {
    console.log("Build completed successfully");
  })
  .catch((error) => {
    console.error("Build failed:", error);
    process.exit(1);
  });
