# Vendored libraries

Served from our own origin for the sandboxed custom frame. Versioned folders are immutable; upgrades add a new folder and update the planner table and three import map. No runtime dependencies are added.

Pinned on 2026-10-20: three 0.186.1, p5 1.11.13 (latest 1.x), Matter.js 0.20.0, D3 7.9.0. p5 is LGPL-2.1, correcting the spec's MIT/ISC assumption. Licence files accompany the libraries.

| File | Version | npm source URL | Package file / transformation | Licence | Bytes | SHA-256 |
|---|---|---|---|---|---|---|
| `three@0.186.1/three.module.min.js` | 0.186.1 | https://registry.npmjs.org/three/-/three-0.186.1.tgz | build/three.module.js + build/three.core.js; bundled/minified with esbuild 0.25.0 | MIT | 742267 | `790335e0030015de6ea8b6f4263254b608143ba730b1719b26b7028b9d139fec` |
| `three@0.186.1/addons/controls/OrbitControls.js` | 0.186.1 | https://registry.npmjs.org/three/-/three-0.186.1.tgz | examples/jsm/controls/OrbitControls.js | MIT | 40755 | `3d79d07ecb686b4e5d93232eedab255331c1beef711e13164eaa1f68655a5f2b` |
| `three@0.186.1/LICENSE` | 0.186.1 | https://registry.npmjs.org/three/-/three-0.186.1.tgz | LICENSE | MIT | 1081 | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |
| `p5@1.11.13/p5.min.js` | 1.11.13 | https://registry.npmjs.org/p5/-/p5-1.11.13.tgz | lib/p5.min.js | LGPL-2.1 | 1063246 | `e9df7d05fd7c3ff028fc09a312a43101241f23c43143b387bf89d96b2e4e0849` |
| `p5@1.11.13/LICENSE` | 1.11.13 | https://registry.npmjs.org/p5/-/p5-1.11.13.tgz | license.txt | LGPL-2.1 | 24480 | `eb2f25f8f165d5f20682c1ce7e99ce69144ecfd80fbed8c17dfd327ecd8b6cb6` |
| `matter@0.20.0/matter.min.js` | 0.20.0 | https://registry.npmjs.org/matter-js/-/matter-js-0.20.0.tgz | build/matter.min.js | MIT | 83476 | `72d30be0f579eb02ce1e0b6f9d359a4f392e6837e5a26ba8be5dbee7f88e24ae` |
| `matter@0.20.0/LICENSE` | 0.20.0 | https://registry.npmjs.org/matter-js/-/matter-js-0.20.0.tgz | LICENSE | MIT | 1092 | `ed182087be5b26734aa6d4789743de3a97417950e8c1e3ff2e3d19c6462720d3` |
| `d3@7.9.0/d3.min.js` | 7.9.0 | https://registry.npmjs.org/d3/-/d3-7.9.0.tgz | dist/d3.min.js | ISC | 279706 | `f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539` |
| `d3@7.9.0/LICENSE` | 7.9.0 | https://registry.npmjs.org/d3/-/d3-7.9.0.tgz | LICENSE | ISC | 731 | `3e6849627f74ff73c257a3ae1efb574015d94fc1035c05ec3c15805165efcbc4` |

three ships no minified module. Reproduce its single-file bundle from the extracted npm package with esbuild 0.25.0 (one-off tooling, not a project dependency):

```sh
esbuild package/build/three.module.js --bundle --minify --format=esm --outfile=three.module.min.js
```

OrbitControls is unmodified and resolves its bare `three` import through the frame import map. The other three scripts are copied unmodified. These source URLs are provenance only; interactives never fetch them.

Gzip sizes (gzip level 9, mtime 0):

- `three@0.186.1/three.module.min.js`: 188667 bytes.
- `three@0.186.1/addons/controls/OrbitControls.js`: 8473 bytes.
- `p5@1.11.13/p5.min.js`: 250509 bytes.
- `matter@0.20.0/matter.min.js`: 25860 bytes.
- `d3@7.9.0/d3.min.js`: 92459 bytes.

Pre-existing JSXGraph 1.14.0 (`jsxgraphcore.js`) stays managed by postinstall: https://registry.npmjs.org/jsxgraph/-/jsxgraph-1.14.0.tgz, MIT OR LGPL-3.0-or-later, 993978 bytes, SHA-256 `72481cfa439d74c4eb517dbc1c7e948ecbfcfafa07a69bb116f38c04065fa56b`.
