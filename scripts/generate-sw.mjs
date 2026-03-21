import { readdirSync, statSync, writeFileSync, readFileSync } from "fs";
import { join, relative } from "path";
import { createHash } from "crypto";

const distDir = join(import.meta.dirname, "../dist");

function getAllFiles(dir, baseDir = dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      const relativePath = "/" + relative(baseDir, fullPath);
      files.push(relativePath);
    }
  }
  return files;
}

const allFiles = getAllFiles(distDir);

// Filter out sw.js itself, source maps, and version.json
const assets = allFiles.filter(
  (f) => !f.endsWith(".map") && f !== "/sw.js" && f !== "/version.json"
);

// Generate build ID from content hash of main assets
const mainAssets = assets.filter(
  (f) => f.endsWith(".js") || f.endsWith(".css") || f === "/index.html"
);
const hashContent = mainAssets
  .map((f) => readFileSync(join(distDir, f.slice(1))))
  .join("");
const buildHash = createHash("sha256").update(hashContent).digest("hex").slice(0, 12);
const buildTime = Date.now();
const buildId = `${buildHash}-${buildTime}`;

// Generate version.json
const versionInfo = {
  buildId,
  buildHash,
  buildTime,
  buildDate: new Date(buildTime).toISOString(),
};
writeFileSync(join(distDir, "version.json"), JSON.stringify(versionInfo, null, 2));
console.log(`Generated version.json with buildId: ${buildId}`);

const swTemplate = readFileSync(
  join(import.meta.dirname, "../public/sw.js"),
  "utf-8"
);

// Replace the PRECACHE_ASSETS array with the generated list
const swContent = swTemplate.replace(
  /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
  `const PRECACHE_ASSETS = ${JSON.stringify(assets, null, 2)};`
);

// Update cache version based on build hash
const cacheVersion = `chat-pwa-${buildHash}`;
const finalContent = swContent
  .replace(/const CACHE_NAME = ".*?";/, `const CACHE_NAME = "${cacheVersion}";`)
  .replace(/const BUILD_ID = ".*?";/, `const BUILD_ID = "${buildId}";`);

writeFileSync(join(distDir, "sw.js"), finalContent);
console.log(`Generated sw.js with ${assets.length} assets to precache`);
