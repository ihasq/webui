import { readdirSync, statSync, writeFileSync, readFileSync } from "fs";
import { join, relative } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

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

// Filter out sw.js itself, source maps, version.json, and bundle files
const assets = allFiles.filter(
  (f) =>
    !f.endsWith(".map") &&
    f !== "/sw.js" &&
    f !== "/version.json" &&
    f !== "/bundle.tar.zst"
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

// Generate bundle.tar.zst
let bundleInfo = null;
try {
  // Check if zstd is available
  execSync("which zstd", { stdio: "ignore" });

  // Create tar archive and compress with zstd level 22
  // Use relative paths from dist directory
  const tarFiles = assets.map((f) => f.slice(1)).join(" ");
  execSync(`tar -cf - ${tarFiles} | zstd --ultra -22 -o bundle.tar.zst`, {
    cwd: distDir,
    stdio: "inherit",
  });

  // Get bundle size and hash
  const bundlePath = join(distDir, "bundle.tar.zst");
  const bundleData = readFileSync(bundlePath);
  const bundleSize = bundleData.length;
  const bundleHash = createHash("sha256").update(bundleData).digest("hex").slice(0, 16);

  bundleInfo = {
    url: "/bundle.tar.zst",
    size: bundleSize,
    hash: bundleHash,
  };

  console.log(
    `Generated bundle.tar.zst (${(bundleSize / 1024 / 1024).toFixed(2)} MB, hash: ${bundleHash})`
  );
} catch (err) {
  console.warn("zstd not available, skipping bundle generation:", err.message);
}

// Generate version.json
const versionInfo = {
  buildId,
  buildHash,
  buildTime,
  buildDate: new Date(buildTime).toISOString(),
  ...(bundleInfo && { bundle: bundleInfo }),
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
const cacheVersion = Date.now(); // Use timestamp for DB version
const finalContent = swContent
  .replace(/const CACHE_VERSION = \d+;/, `const CACHE_VERSION = ${cacheVersion};`)
  .replace(/const BUILD_ID = ".*?";/, `const BUILD_ID = "${buildId}";`);

writeFileSync(join(distDir, "sw.js"), finalContent);
console.log(`Generated sw.js with ${assets.length} assets to precache`);
