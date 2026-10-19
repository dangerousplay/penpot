// Verifies src/engine/** against VENDORED.json (catches local edits to the vendored copy).
// The nova-terra side (`bun run engine:sync <dir> --check`) catches a stale copy.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listFiles(dir, base = dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listFiles(p, base));
        else out.push(path.relative(base, p).split(path.sep).join("/"));
    }
    return out.sort();
}

/** @returns {{ ok: boolean, problems: string[] }} */
export function checkVendor(pkgDir = PKG_DIR) {
    const problems = [];
    const manifestPath = path.join(pkgDir, "VENDORED.json");
    const engineDir = path.join(pkgDir, "src/engine");
    if (!existsSync(manifestPath)) return { ok: false, problems: ["VENDORED.json is missing"] };
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const present = existsSync(engineDir) ? listFiles(engineDir) : [];
    for (const rel of Object.keys(manifest.files)) {
        if (!present.includes(rel)) {
            problems.push(`${rel}: missing (listed in VENDORED.json)`);
            continue;
        }
        const hash = createHash("sha256")
            .update(readFileSync(path.join(engineDir, rel)))
            .digest("hex");
        if (hash !== manifest.files[rel]) problems.push(`${rel}: modified (hash differs from VENDORED.json)`);
    }
    for (const rel of present) {
        if (!(rel in manifest.files)) problems.push(`${rel}: unknown (not listed in VENDORED.json)`);
    }
    return { ok: problems.length === 0, problems };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { ok, problems } = checkVendor();
    if (!ok) {
        console.error("check:vendor failed. Never edit src/engine by hand; fix it in nova-terra and run engine:sync.");
        for (const p of problems) console.error(`  ${p}`);
        process.exit(1);
    }
    console.log("check:vendor: engine matches VENDORED.json");
}
