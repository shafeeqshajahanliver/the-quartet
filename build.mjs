// Builds the Vercel site from the same page file published on claude.ai.
// page/index.html is the page body; this wraps it in a full document and adds the storage adapter.
import fs from "node:fs";

const page = fs.readFileSync("page/index.html", "utf8");
const head = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#f4ecdc;color:#151a2c}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="/claude-shim.js"></script>
</head><body>
`;
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/index.html", head + page + "\n</body></html>\n");
fs.copyFileSync("shim/claude-shim.js", "public/claude-shim.js");
console.log("Built public/index.html");
