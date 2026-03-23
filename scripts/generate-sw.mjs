import {
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  rmSync,
} from "fs";
import { join, relative } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

const distDir = join(import.meta.dirname, "../dist");
const distSwDir = join(import.meta.dirname, "../dist-sw");
const publicDir = join(import.meta.dirname, "../public");

// Files that should NOT be in the bundle (served individually)
const INDIVIDUAL_FILES = new Set([
  "/index.html", // This will be the installer
  "/sw.js",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.json",
  "/robots.txt",
  "/og-image.svg",
  "/icons.svg",
  "/version.json",
  "/bundle.tar.zst",
]);

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

// Step 1: Rename Vite's index.html to app.html (this is the React app)
const viteIndexHtml = join(distDir, "index.html");
const appHtml = join(distDir, "app.html");
if (existsSync(viteIndexHtml)) {
  renameSync(viteIndexHtml, appHtml);
  console.log("Renamed index.html to app.html (React app entry)");
}

// Step 2: Copy installer.html to index.html
const installerSrc = join(publicDir, "installer.html");
const installerDest = join(distDir, "index.html");
copyFileSync(installerSrc, installerDest);
console.log("Copied installer.html to index.html");

// Step 3: Get all files and separate into individual vs bundle
const allFiles = getAllFiles(distDir);

const individualFiles = allFiles.filter(
  (f) => INDIVIDUAL_FILES.has(f) || f.endsWith(".map")
);

const bundleFiles = allFiles.filter(
  (f) => !INDIVIDUAL_FILES.has(f) && !f.endsWith(".map") && f !== "/app.html"
);

// Add app.html to bundle files (renamed from index.html)
// In the bundle, it will be stored as /index.html so the SW can serve it
const bundleFilesWithAppHtml = [...bundleFiles];
// We'll handle app.html -> index.html rename in tar command

console.log(`Individual files: ${individualFiles.length}`);
console.log(`Bundle files: ${bundleFilesWithAppHtml.length + 1} (including app.html as index.html)`);

// Step 4: Generate build ID from content hash of main assets
const mainAssets = bundleFilesWithAppHtml.filter(
  (f) => f.endsWith(".js") || f.endsWith(".css")
);
const hashContent = mainAssets
  .map((f) => readFileSync(join(distDir, f.slice(1))))
  .join("");
const appHtmlContent = readFileSync(appHtml);
const fullHashContent = hashContent + appHtmlContent;
const buildHash = createHash("sha256")
  .update(fullHashContent)
  .digest("hex")
  .slice(0, 12);
const buildTime = Date.now();
const buildId = `${buildHash}-${buildTime}`;

// Step 5: Generate bundle.tar.zst with optimized file order
// Order: index.html first (for immediate display), then main JS/CSS, then other assets
let bundleInfo = null;
try {
  execSync("which zstd", { stdio: "ignore" });

  // Separate files by priority for optimal streaming load order
  const mainJsCss = bundleFilesWithAppHtml.filter(
    (f) => f.match(/^\/assets\/main-[^/]+\.(js|css)$/)
  );
  const otherAssets = bundleFilesWithAppHtml.filter(
    (f) => !f.match(/^\/assets\/main-[^/]+\.(js|css)$/)
  );

  // Build ordered file list: app.html (becomes index.html) → main JS/CSS → other assets
  const orderedFiles = [
    "app.html",
    ...mainJsCss.map((f) => f.slice(1)),
    ...otherAssets.map((f) => f.slice(1)),
  ];

  console.log(`Tar order: app.html (→index.html), ${mainJsCss.length} main assets, ${otherAssets.length} other files`);

  // Create tar with app.html renamed to index.html
  const tarFilesList = orderedFiles.join(" ");
  execSync(
    `tar -cf - --transform='s/^app\\.html$/index.html/' ${tarFilesList} | zstd -f --ultra -22 -o bundle.tar.zst`,
    {
      cwd: distDir,
      stdio: "inherit",
    }
  );

  const bundlePath = join(distDir, "bundle.tar.zst");
  const bundleData = readFileSync(bundlePath);
  const bundleSize = bundleData.length;
  const bundleHash = createHash("sha256")
    .update(bundleData)
    .digest("hex")
    .slice(0, 16);

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

// Step 6: Generate version.json
const versionInfo = {
  buildId,
  buildHash,
  buildTime,
  buildDate: new Date(buildTime).toISOString(),
  ...(bundleInfo && { bundle: bundleInfo }),
};
writeFileSync(
  join(distDir, "version.json"),
  JSON.stringify(versionInfo, null, 2)
);
console.log(`Generated version.json with buildId: ${buildId}`);

// Step 7: Copy and update sw.js from dist-sw
const swSrc = join(distSwDir, "sw.js");
if (existsSync(swSrc)) {
  let swContent = readFileSync(swSrc, "utf-8");

  // Replace placeholders (these are quoted strings that survive minification)
  swContent = swContent
    .replace(/%%BUILD_ID%%/g, buildId)
    .replace(/%%BUNDLE_INFO%%/g, JSON.stringify(bundleInfo));

  writeFileSync(join(distDir, "sw.js"), swContent);
  console.log("Generated sw.js with bundle extractor");
} else {
  console.error("ERROR: dist-sw/sw.js not found. Run vite build --config vite.sw.config.ts first.");
  process.exit(1);
}

// Step 8: Cleanup - remove files that are only needed in bundle
const filesToRemove = [
  join(distDir, "app.html"),
  join(distDir, "installer.html"),
];
for (const file of filesToRemove) {
  if (existsSync(file)) {
    unlinkSync(file);
  }
}

// Remove bundled assets (they're now in bundle.tar.zst)
if (bundleInfo) {
  for (const bundleFile of bundleFilesWithAppHtml) {
    const filePath = join(distDir, bundleFile.slice(1));
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
  // Remove empty assets directory if it exists
  const assetsDir = join(distDir, "assets");
  if (existsSync(assetsDir)) {
    rmSync(assetsDir, { recursive: true });
  }
  console.log("Cleaned up bundled files from dist/");
}

console.log("Cleaned up intermediate files");

console.log("Build complete!");
