import { defineConfig } from "tsup";

export default defineConfig([
  // Server entry (Node.js)
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
    platform: "node",
    external: ["react", "@copilotkit/react-core", "@ag-ui/client", "@ag-ui/core"],
  },
  // React entry (Browser)
  {
    entry: { "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "es2022",
    platform: "browser",
    external: ["react", "@copilotkit/react-core", "@ag-ui/client", "@ag-ui/core"],
  },
]);
