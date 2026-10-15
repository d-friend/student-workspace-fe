// The workspace iframe loads JSXGraph from /vendor/, so copy the browser build into public/.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/jsxgraph/distrib";
const to = "public/vendor";
mkdirSync(to, { recursive: true });
for (const file of ["jsxgraphcore.js", "jsxgraph.css"]) copyFileSync(`${from}/${file}`, `${to}/${file}`);
