// After `vite build`, write dist/standalone.html: a copy of dist/index.html with the
// manifest and icons inlined as data: URIs, so that one file can be hosted entirely
// on its own (for example as a shared preview page).
//
// dist/index.html itself keeps linking the real manifest.webmanifest and icons served
// beside it. Android builds an installed app (a WebAPK) from the manifest *URL* and
// re-fetches it from there to check for updates, which a data: URL can't support.
import { readFileSync, writeFileSync } from "node:fs";

const source = "dist/index.html";
const target = "dist/standalone.html";
const b64 = (path) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
for (const icon of manifest.icons) icon.src = b64(`public/${icon.src}`);
manifest.start_url = ".";
manifest.scope = ".";
delete manifest.id; // a relative id means nothing inside a data: URL
const manifestUri = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;

const html = readFileSync(source, "utf8");
const replacements = [
  ['href="./manifest.webmanifest"', `href="${manifestUri}"`],
  ['href="./icons/icon-192.png"', `href="${b64("public/icons/icon-192.png")}"`],
  ['href="./icons/apple-touch-icon-180.png"', `href="${b64("public/icons/apple-touch-icon-180.png")}"`],
];
let out = html;
for (const [from, to] of replacements) {
  if (!out.includes(from)) throw new Error(`inline-pwa: expected ${from} in ${source}`);
  out = out.replace(from, to);
}
writeFileSync(target, out);
console.log(`wrote ${target} with the manifest and icons inlined (${(out.length / 1024).toFixed(0)} kB); ${source} links them as files`);
