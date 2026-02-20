import { useMemo } from "react";
import { Dict, Name, Ref } from "@pdfjs/core/primitives";
import { BaseStream } from "@pdfjs/core/base_stream";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Stream } from "@pdfjs/core/stream";
import { parseContentStream } from "@/lib/contentStream";
import { inspectCMap } from "@/lib/cmap";
import type { GlyphEntry } from "@/lib/fontFile";
import { BADGE_COLORS, type NormalizedFont } from "@/lib/fontFile";
import { FontView } from "@/components/app/detail/FontFileView";

// ── CharProc → SVG path ────────────────────────────────────────────────

function getStreamBytes(stream: unknown): Uint8Array | null {
  if (stream instanceof FlateStream) {
    return stream.buffer.subarray(0, stream.bufferLength);
  }
  if (stream instanceof Stream) {
    return stream.bytes.slice(stream.start, stream.end);
  }
  if (stream instanceof BaseStream) {
    return stream.getBytes();
  }
  return null;
}

function charProcToSVG(bytes: Uint8Array): string {
  const ops = parseContentStream(bytes);
  const parts: string[] = [];
  let cx = 0,
    cy = 0;

  for (const { op, args } of ops) {
    const n = (i: number) => {
      const a = args[i];
      return a && "value" in a && typeof a.value === "number" ? a.value : 0;
    };

    switch (op) {
      case "m":
        cx = n(0);
        cy = n(1);
        parts.push(`M${cx} ${cy}`);
        break;
      case "l":
        cx = n(0);
        cy = n(1);
        parts.push(`L${cx} ${cy}`);
        break;
      case "c":
        cx = n(4);
        cy = n(5);
        parts.push(`C${n(0)} ${n(1)} ${n(2)} ${n(3)} ${cx} ${cy}`);
        break;
      case "v":
        parts.push(`C${cx} ${cy} ${n(0)} ${n(1)} ${n(2)} ${n(3)}`);
        cx = n(2);
        cy = n(3);
        break;
      case "y":
        cx = n(2);
        cy = n(3);
        parts.push(`C${n(0)} ${n(1)} ${cx} ${cy} ${cx} ${cy}`);
        break;
      case "h":
        parts.push("Z");
        break;
      case "re": {
        const rx = n(0),
          ry = n(1),
          rw = n(2),
          rh = n(3);
        parts.push(
          `M${rx} ${ry}L${rx + rw} ${ry}L${rx + rw} ${ry + rh}L${rx} ${ry + rh}Z`,
        );
        cx = rx;
        cy = ry;
        break;
      }
    }
  }
  return parts.join("");
}

// ── Inspection ─────────────────────────────────────────────────────────

/**
 * Parse the Encoding dict's Differences array into a bidirectional mapping
 * between character codes and glyph names.
 */
function parseEncoding(dict: Dict): {
  nameToCode: Map<string, number>;
  encodingName?: string;
} {
  const nameToCode = new Map<string, number>();
  let encodingName: string | undefined;

  const enc = dict.get("Encoding");
  if (enc instanceof Name) {
    encodingName = enc.name;
  } else if (enc instanceof Dict) {
    const baseEnc = enc.get("BaseEncoding");
    if (baseEnc instanceof Name) encodingName = baseEnc.name;

    const diffs: unknown[] = enc.get("Differences") ?? [];
    let code = 0;
    for (const entry of diffs) {
      if (typeof entry === "number") {
        code = entry;
      } else if (entry instanceof Name) {
        nameToCode.set(entry.name, code);
        code++;
      }
    }
  }
  return { nameToCode, encodingName };
}

/**
 * Read and parse the ToUnicode CMap stream, returning a code→char mapping.
 */
function parseToUnicode(dict: Dict): {
  codeToUnicode: Map<number, string>;
  cmapName?: string;
} | null {
  const toUnicode = dict.get("ToUnicode");
  if (!toUnicode) return null;

  const bytes = getStreamBytes(toUnicode);
  if (!bytes || bytes.length === 0) return null;

  const parsed = inspectCMap(bytes);
  if (!parsed) return null;

  const codeToUnicode = new Map<number, string>();
  for (const m of parsed.mappings) {
    codeToUnicode.set(m.code, m.char);
  }
  return { codeToUnicode, cmapName: parsed.name || undefined };
}

function inspectType3(dict: Dict): NormalizedFont | null {
  const subtype = dict.get("Subtype");
  if (!(subtype instanceof Name) || subtype.name !== "Type3") return null;

  const fontBBox: number[] = dict.get("FontBBox") ?? [0, 0, 1000, 1000];
  const fontMatrix: number[] = dict.get("FontMatrix") ?? [
    0.001, 0, 0, 0.001, 0, 0,
  ];

  const baseFont = dict.get("BaseFont");
  const baseFontName = baseFont instanceof Name ? baseFont.name : undefined;
  const nameVal = dict.get("Name");
  const fontName =
    baseFontName ?? (nameVal instanceof Name ? nameVal.name : undefined);

  const firstChar: number | undefined = dict.get("FirstChar") ?? undefined;
  const lastChar: number | undefined = dict.get("LastChar") ?? undefined;

  // Encoding → glyph name ↔ character code
  const { nameToCode, encodingName } = parseEncoding(dict);

  // ToUnicode → character code → Unicode
  const toUnicode = parseToUnicode(dict);
  const codeToUnicode = toUnicode?.codeToUnicode;

  const charProcs: Dict | undefined = dict.get("CharProcs");
  const glyphNames =
    charProcs
      ?.getKeys()
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) ?? [];
  const glyphs: GlyphEntry[] = [];

  for (const glyphName of glyphNames) {
    const rawVal = charProcs!.getRaw(glyphName);
    const glyphRef = rawVal instanceof Ref ? rawVal : undefined;
    const stream = charProcs!.get(glyphName);
    if (!stream) continue;
    if (stream instanceof BaseStream) {
      stream.getBytes();
    }
    const bytes = getStreamBytes(stream);
    let svgPath = "";
    if (bytes && bytes.length > 0) {
      try {
        svgPath = charProcToSVG(bytes);
      } catch {
        // leave empty
      }
    }

    // Resolve Unicode: glyphName → code (via Encoding) → char (via ToUnicode)
    let unicodeChar: string | undefined;
    const code = nameToCode.get(glyphName);
    if (code != null && codeToUnicode) {
      unicodeChar = codeToUnicode.get(code);
    }

    glyphs.push({
      id: glyphs.length,
      svgPath,
      glyphName,
      unicodeChar,
      isGlyphIndex: true,
      ref: glyphRef,
    });
  }

  const identityRows: [string, string][] = [];
  if (fontName) identityRows.push(["Name", fontName]);
  identityRows.push(["Glyphs", String(glyphNames.length)]);
  if (firstChar != null && lastChar != null)
    identityRows.push(["Char Range", `${firstChar}–${lastChar}`]);
  if (encodingName) identityRows.push(["Encoding", encodingName]);
  if (toUnicode)
    identityRows.push([
      "ToUnicode",
      toUnicode.cmapName || `${codeToUnicode!.size} mappings`,
    ]);

  const metricsRows: [string, string][] = [];
  metricsRows.push([
    "Bounding Box",
    `[${fontBBox[0]}, ${fontBBox[1]}] – [${fontBBox[2]}, ${fontBBox[3]}]`,
  ]);
  metricsRows.push([
    "Font Matrix",
    fontMatrix
      .map((v) => (Number.isInteger(v) ? String(v) : v.toFixed(4)))
      .join(", "),
  ]);

  const [llx, , urx, ury] = fontBBox;
  const lly = fontBBox[1];
  const w = urx - llx || 1;
  const h = ury - lly || 1;
  const pad = Math.max(w, h) * 0.04;
  const viewBox = `${llx - pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`;
  const yMax = ury + pad;

  const cachedGlyphs = glyphs;
  return {
    format: "Type 3",
    badgeColor: BADGE_COLORS["Type 3"] ?? "bg-gray-100 text-gray-800",
    displayName: fontName,
    extraBadges: [],
    identityRows,
    metricsRows,
    hasCmap: false,
    getGlyphSVG: () => null,
    getMappedCodePoints: () => [],
    getGlyphsByIndex: () => cachedGlyphs,
    viewBox,
    yMax,
  };
}

// ── Component ──────────────────────────────────────────────────────────

export default function Type3FontView({
  dict,
  onRefClick,
}: {
  dict: Dict;
  onRefClick?: (ref: Ref) => void;
}) {
  const font = useMemo(() => inspectType3(dict), [dict]);
  if (!font) return null;
  return <FontView font={font} onRefClick={onRefClick} />;
}
