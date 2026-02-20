#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function stripPrefix(p) {
  if (!p) return null;
  if (p === "/dev/null") return null;
  return p.replace(/^([ab])\//, "").trim();
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readLines(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").split("\n");
}

function writeLines(p, lines) {
  ensureDirForFile(p);
  fs.writeFileSync(p, lines.join("\n"), "utf8");
}

function eqLine(a, b) {
  return a === b;
}

function parseHunkHeader(h) {
  const m = h.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!m) throw new Error("Invalid hunk header: " + h);
  return { oldStart: parseInt(m[1], 10) - 1 };
}

function tryApplyAt(lines, hunk, startIdx) {
  const out = [...lines];
  let i = startIdx;

  for (const raw of hunk.lines) {
    const prefix = raw[0];
    const content = raw.slice(1);

    if (prefix === " ") {
      if (!eqLine(out[i] ?? "", content)) return null;
      i++;
    } else if (prefix === "-") {
      if (!eqLine(out[i] ?? "", content)) return null;
      out.splice(i, 1);
    } else if (prefix === "+") {
      out.splice(i, 0, content);
      i++;
    } else {
      // ignore weird lines
      return null;
    }
  }

  return out;
}

function applyHunk(lines, hunk, filePath) {
  const { oldStart } = parseHunkHeader(hunk.header);

  // suggested position
  {
    const suggested = Math.min(Math.max(0, oldStart), lines.length);
    const applied = tryApplyAt(lines, hunk, suggested);
    if (applied) return applied;
  }

  // scan entire file for first context line anchor
  const firstContext = hunk.lines.find(l => l[0] === " ");
  if (firstContext) {
    const anchor = firstContext.slice(1);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== anchor) continue;
      const applied = tryApplyAt(lines, hunk, i);
      if (applied) return applied;
    }
  }

  throw new Error(`Context mismatch in ${filePath}: ${hunk.header}`);
}

function parsePatch(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const files = [];
  let cur = null;
  let curHunk = null;

  const startFile = (aPath, bPath) => {
    if (cur) files.push(cur);
    cur = {
      aPath: stripPrefix(aPath),
      bPath: stripPrefix(bPath),
      oldPath: null,
      newPath: null,
      renameFrom: null,
      renameTo: null,
      copyFrom: null,
      copyTo: null,
      isNew: false,
      isDelete: false,
      hunks: [],
    };
    curHunk = null;
  };

  for (const line of lines) {
    const m = line.match(/^diff --git\s+(.+?)\s+(.+?)\s*$/);
    if (m) {
      startFile(m[1], m[2]);
      continue;
    }
    if (!cur) continue;

    if (line.startsWith("new file mode ")) {
      cur.isNew = true;
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      cur.isDelete = true;
      continue;
    }
    if (line.startsWith("rename from ")) {
      cur.renameFrom = line.slice("rename from ".length).trim();
      continue;
    }
    if (line.startsWith("rename to ")) {
      cur.renameTo = line.slice("rename to ".length).trim();
      continue;
    }
    if (line.startsWith("copy from ")) {
      cur.copyFrom = line.slice("copy from ".length).trim();
      continue;
    }
    if (line.startsWith("copy to ")) {
      cur.copyTo = line.slice("copy to ".length).trim();
      continue;
    }
    if (line.startsWith("--- ")) {
      cur.oldPath = stripPrefix(line.slice(4).trim());
      continue;
    }
    if (line.startsWith("+++ ")) {
      cur.newPath = stripPrefix(line.slice(4).trim());
      continue;
    }

    if (line.startsWith("@@")) {
      curHunk = { header: line, lines: [] };
      cur.hunks.push(curHunk);
      continue;
    }
    if (curHunk) {
      if (line === "\\ No newline at end of file") continue;
      // hunk lines begin with ' ', '+', '-'
      if (line[0] === " " || line[0] === "+" || line[0] === "-") {
        curHunk.lines.push(line);
      } else {
        // Some patches can have empty lines represented as " " only; handle that:
        if (line === "") curHunk.lines.push(" " + "");
      }
    }
  }

  if (cur) files.push(cur);
  return files;
}

function applyFileEntry(entry) {
  // Determine old/new target paths.
  // Priority:
  // 1) explicit rename/copy
  // 2) ---/+++ paths
  // 3) diff --git header paths
  const renameFrom = entry.renameFrom ? stripPrefix(entry.renameFrom) : null;
  const renameTo = entry.renameTo ? stripPrefix(entry.renameTo) : null;
  const copyFrom = entry.copyFrom ? stripPrefix(entry.copyFrom) : null;
  const copyTo = entry.copyTo ? stripPrefix(entry.copyTo) : null;

  const oldPath =
    renameFrom ??
    copyFrom ??
    entry.oldPath ??
    entry.aPath;

  const newPath =
    renameTo ??
    copyTo ??
    entry.newPath ??
    entry.bPath;

  const fullOld = oldPath ? path.join(process.cwd(), oldPath) : null;
  const fullNew = newPath ? path.join(process.cwd(), newPath) : null;

  // Rename-only / copy-only blocks (similarity 100%) might have no hunks.
  if (renameFrom && renameTo) {
    if (!fullOld || !fullNew) return;
    if (!fs.existsSync(fullOld)) {
      console.warn("Rename source missing:", oldPath);
    } else {
      ensureDirForFile(fullNew);
      fs.renameSync(fullOld, fullNew);
      console.log("Renamed", oldPath, "->", newPath);
    }
    // if hunks also exist (rare), we'll apply them below to the new path.
  }

  if (copyFrom && copyTo) {
    if (!fullOld || !fullNew) return;
    if (!fs.existsSync(fullOld)) {
      console.warn("Copy source missing:", oldPath);
    } else {
      ensureDirForFile(fullNew);
      fs.copyFileSync(fullOld, fullNew);
      console.log("Copied", oldPath, "->", newPath);
    }
  }

  if (entry.isDelete || (oldPath && !newPath)) {
    if (fullOld && fs.existsSync(fullOld)) {
      fs.unlinkSync(fullOld);
      console.log("Deleted", oldPath);
    }
    return;
  }

  // Apply hunks if present.
  if (!entry.hunks.length) {
    // nothing else to do (rename/copy already handled)
    return;
  }

  const target = fullNew || fullOld;
  const targetRel = newPath || oldPath || "(unknown)";
  if (!target) {
    console.warn("Skipping a file with no target:", targetRel);
    return;
  }

  // If it's a new file (or old was /dev/null), start empty.
  let contentLines = [];
  const treatAsCreate = entry.isNew || entry.oldPath === null;

  if (!treatAsCreate && fs.existsSync(target)) {
    contentLines = readLines(target);
  }

  for (const hunk of entry.hunks) {
    contentLines = applyHunk(contentLines, hunk, targetRel);
  }

  writeLines(target, contentLines);
  console.log(treatAsCreate ? "Created/Updated" : "Updated", targetRel);
}

function applyPatchFile(patchPath) {
  const text = fs.readFileSync(patchPath, "utf8");
  const entries = parsePatch(text);

  for (const e of entries) {
    applyFileEntry(e);
  }
  console.log("Done.");
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/patch.mjs <patch-file1> [patch-file2 ...]");
  process.exit(1);
}

for (const p of args) {
  applyPatchFile(p);
  fs.unlinkSync(p);
  console.log("Deleted patch file", p);
}