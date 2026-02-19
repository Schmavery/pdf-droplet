#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function normalize(p) {
  if (!p || p === "/dev/null") return null;
  return p.replace(/^([ab])\//, "").trim();
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readFileLines(p) {
  if (!p || !fs.existsSync(p)) return [];
  // keep exact contents except normalize line endings to LF
  return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").split("\n");
}

function writeFileLines(p, lines) {
  ensureDir(p);
  fs.writeFileSync(p, lines.join("\n"), "utf8");
}

function parsePatch(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const files = [];
  let current = null;
  let hunk = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("diff --git")) {
      if (current) files.push(current);
      current = { oldPath: null, newPath: null, hunks: [] };
      hunk = null;
      continue;
    }
    if (!current) continue;

    if (line.startsWith("--- ")) {
      current.oldPath = normalize(line.slice(4));
      continue;
    }
    if (line.startsWith("+++ ")) {
      current.newPath = normalize(line.slice(4));
      continue;
    }
    if (line.startsWith("@@")) {
      hunk = { header: line, lines: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (hunk) {
      // include lines beginning with ' ', '+', '-', or '\'
      // keep '\ No newline at end of file' as-is (it won't start with space)
      if (line === "\\ No newline at end of file") {
        // attach marker to previous line by appending nothing (no-op)
        // we will ignore this marker when matching to avoid strict mismatches
        hunk.lines.push(line);
      } else {
        hunk.lines.push(line);
      }
    }
  }
  if (current) files.push(current);
  return files;
}

function hunkBeforeSequence(hunk) {
  return hunk.lines
    .filter(l => l.length > 0 && (l[0] === " " || l[0] === "-"))
    .map(l => (l[0] === " " || l[0] === "-") ? l.slice(1) : l);
}

function hunkAfterSequence(hunk) {
  return hunk.lines
    .filter(l => l.length > 0 && (l[0] === " " || l[0] === "+"))
    .map(l => (l[0] === " " || l[0] === "+") ? l.slice(1) : l);
}

function applyHunkToLines(lines, hunk, filePath) {
  const headerMatch = hunk.header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!headerMatch) throw new Error("Invalid hunk header: " + hunk.header);

  const oldStart = parseInt(headerMatch[1], 10) - 1; // 0-based
  // Build before/after sequences
  const beforeSeq = hunkBeforeSequence(hunk);
  const afterSeq = hunkAfterSequence(hunk);

  // 1) Try exact position first (strict)
  if (beforeSeq.length === 0) {
    // Pure add hunk: try to insert at oldStart (or 0 if file is empty)
    const insertAt = Math.min(Math.max(0, oldStart), lines.length);
    const newLines = [...lines];
    newLines.splice(insertAt, 0, ...afterSeq);
    return newLines;
  }

  // strict match at suggested location
  let suggestedStart = Math.min(Math.max(0, oldStart), Math.max(0, lines.length - beforeSeq.length));
  let strictOk = true;
  for (let j = 0; j < beforeSeq.length; j++) {
    if ((lines[suggestedStart + j] ?? "") !== beforeSeq[j]) {
      strictOk = false;
      break;
    }
  }
  if (strictOk) {
    const result = [...lines];
    result.splice(suggestedStart, beforeSeq.length, ...afterSeq);
    return result;
  }

  // 2) Sliding window search: find any index where beforeSeq matches exactly
  for (let i = 0; i <= lines.length - beforeSeq.length; i++) {
    let ok = true;
    for (let j = 0; j < beforeSeq.length; j++) {
      if ((lines[i + j] ?? "") !== beforeSeq[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const result = [...lines];
      result.splice(i, beforeSeq.length, ...afterSeq);
      return result;
    }
  }

  // 3) Fallback heuristics: try fuzzy match by matching subset of beforeSeq (head or tail)
  // Try to match last N lines of beforeSeq
  const minMatch = Math.max(1, Math.floor(beforeSeq.length / 2));
  // tail match
  for (let matchLen = beforeSeq.length; matchLen >= minMatch; matchLen--) {
    const tail = beforeSeq.slice(beforeSeq.length - matchLen);
    for (let i = 0; i <= lines.length - matchLen; i++) {
      let ok = true;
      for (let j = 0; j < matchLen; j++) {
        if ((lines[i + j] ?? "") !== tail[j]) { ok = false; break; }
      }
      if (ok) {
        const result = [...lines];
        // Remove matchLen lines and insert afterSeq (best-effort)
        result.splice(i, matchLen, ...afterSeq);
        console.warn(`Applied hunk to approximate location in ${filePath} (tail-match of ${matchLen}/${beforeSeq.length})`);
        return result;
      }
    }
  }

  // If nothing works, throw with debug info
  const debug = [
    `Hunk header: ${hunk.header}`,
    `File: ${filePath}`,
    `Wanted before seq (len ${beforeSeq.length}):`,
    ...beforeSeq.slice(0, 10).map((l, idx) => `${idx}: ${JSON.stringify(l)}`)
  ].join("\n");
  throw new Error("Context mismatch\n" + debug);
}

function applyPatchFile(patchPath) {
  const text = fs.readFileSync(patchPath, "utf8");
  const files = parsePatch(text);

  for (const file of files) {
    const oldPath = file.oldPath;
    const newPath = file.newPath;
    const isCreate = !oldPath && newPath;
    const isDelete = oldPath && !newPath;
    const targetRel = newPath || oldPath;
    if (!targetRel) {
      console.warn("Skipping a file with no paths in patch");
      continue;
    }

    const fullPath = path.join(process.cwd(), targetRel);

    if (isDelete) {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log("Deleted", targetRel);
      } else {
        console.warn("Delete requested but file missing:", targetRel);
      }
      continue;
    }

    let lines = isCreate ? [] : readFileLines(fullPath);

    for (const hunk of file.hunks) {
      try {
        lines = applyHunkToLines(lines, hunk, targetRel);
      } catch (err) {
        console.error(`Failed to apply hunk for ${targetRel}: ${err.message}`);
        // Optionally show a snippet for debugging
        const preview = lines.slice(0, 20).map((l, i) => `${i + 1}: ${l}`).join("\n");
        console.error("File preview (first 20 lines):\n" + preview);
        throw err;
      }
    }

    writeFileLines(fullPath, lines);
    console.log(isCreate ? "Created" : "Updated", targetRel);
  }

  console.log("Done.");
}

if (process.argv.length < 3) {
  console.error("Usage: patch.mjs <patch-file1> [patch-file2 ...]");
  process.exit(1);
}

const patchFiles = process.argv.slice(2);
for (const p of patchFiles) applyPatchFile(p);