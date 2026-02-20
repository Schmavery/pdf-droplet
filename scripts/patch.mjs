#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { applyPatch } from "diff";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/patch.mjs <patch-file> [...]");
  process.exit(1);
}

const norm = (p) => (p && p !== "/dev/null" ? p.replace(/^([ab])\//, "") : null);
const mkdirp = (p) => fs.mkdirSync(path.dirname(p), { recursive: true });

function splitFilePatches(text) {
  const parts = text.replace(/\r\n/g, "\n").split(/^diff --git /m);
  return parts.slice(1).map(s => "diff --git " + s);
}

function parseHeader(block) {
  const m = block.match(/^diff --git\s+(.+?)\s+(.+?)\n/m);
  const a = m ? norm(m[1].trim()) : null;
  const b = m ? norm(m[2].trim()) : null;

  const rf = block.match(/^rename from (.+)\n/m)?.[1];
  const rt = block.match(/^rename to (.+)\n/m)?.[1];

  const oldP = norm(block.match(/^---\s+(.+)\n/m)?.[1]?.trim()) ?? norm(rf) ?? a;
  const newP = norm(block.match(/^\+\+\+\s+(.+)\n/m)?.[1]?.trim()) ?? norm(rt) ?? b;

  const isRenameOnly = /similarity index 100%/m.test(block) && !/^@@/m.test(block);
  return { oldP, newP, isRenameOnly };
}

for (const patchPath of files) {
  const text = fs.readFileSync(patchPath, "utf8");
  for (const block of splitFilePatches(text)) {
    const { oldP, newP, isRenameOnly } = parseHeader(block);
    if (!oldP && !newP) continue;

    // rename-only (no hunks)
    if (isRenameOnly && oldP && newP && oldP !== newP) {
      const src = path.join(process.cwd(), oldP);
      const dst = path.join(process.cwd(), newP);
      if (fs.existsSync(src)) {
        mkdirp(dst);
        fs.renameSync(src, dst);
        console.log("Renamed", oldP, "->", newP);
      } else {
        console.warn("Rename source missing:", oldP);
      }
      continue;
    }

    // delete
    if (oldP && !newP) {
      const f = path.join(process.cwd(), oldP);
      if (fs.existsSync(f)) fs.unlinkSync(f);
      console.log("Deleted", oldP);
      continue;
    }

    // apply patch to content string
    const target = path.join(process.cwd(), newP ?? oldP);
    const before = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    const after = applyPatch(before, block);

    if (after === false) {
      throw new Error(`Failed to apply patch for ${newP ?? oldP}`);
    }

    mkdirp(target);
    fs.writeFileSync(target, after, "utf8");
    console.log(fs.existsSync(target) ? "Updated" : "Created", newP ?? oldP);
  }

  // delete patch file after success
  fs.unlinkSync(patchPath);
  console.log("Deleted patch file", patchPath);
}