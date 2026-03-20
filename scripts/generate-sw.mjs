import { readdirSync, statSync, writeFileSync, readFileSync } from "fs";
import { join, relative } from "path";

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

// Filter out sw.js itself and source maps
const assets = allFiles.filter(
  (f) => !f.endsWith(".map") && f !== "/sw.js"
);

const swTemplate = readFileSync(
  join(import.meta.dirname, "../public/sw.js"),
  "utf-8"
);

// Replace the PRECACHE_ASSETS array with the generated list
const swContent = swTemplate.replace(
  /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
  `const PRECACHE_ASSETS = ${JSON.stringify(assets, null, 2)};`
);

// Update cache version based on build time
const cacheVersion = `chat-pwa-v${Date.now()}`;
const finalContent = swContent.replace(
  /const CACHE_NAME = ".*?";/,
  `const CACHE_NAME = "${cacheVersion}";`
);

writeFileSync(join(distDir, "sw.js"), finalContent);
console.log(`Generated sw.js with ${assets.length} assets to precache`);
