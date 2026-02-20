import {
  readInt16,
  readUint16,
  readUint32,
} from "@pdfjs/core/core_utils";
import {
  isTrueTypeFile,
  isOpenTypeFile,
  readOpenTypeHeader,
  readTables,
  readNameTable,
} from "@pdfjs/core/fonts";
import { FontRendererFactory, lookupCmap } from "@pdfjs/core/font_renderer";
import { CFFParser } from "@pdfjs/core/cff_parser";
import { Type1Font } from "@pdfjs/core/type1_font";
import { FONT_IDENTITY_MATRIX } from "@pdfjs/shared/util";
import { Stream } from "@pdfjs/core/stream";
import { readAscii } from "@/lib/utils";
import { isCFFFile } from "@/lib/streamDetection";

// ── Types ──────────────────────────────────────────────────────────────

export interface FontTableEntry {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

export interface FontHeadInfo {
  unitsPerEm: number;
  created: Date | null;
  modified: Date | null;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  macStyle: number;
  lowestRecPPEM: number;
  indexToLocFormat: number;
}

export interface FontHheaInfo {
  ascender: number;
  descender: number;
  lineGap: number;
  advanceWidthMax: number;
  numberOfHMetrics: number;
}

export interface FontOS2Info {
  version: number;
  weightClass: number;
  weightClassName: string;
  widthClass: number;
  widthClassName: string;
  fsSelection: number;
  firstCharIndex: number;
  lastCharIndex: number;
  typoAscender?: number;
  typoDescender?: number;
  typoLineGap?: number;
  panose: number[];
  vendorID: string;
}

export interface FontPostInfo {
  format: number;
  italicAngle: number;
  underlinePosition: number;
  underlineThickness: number;
  isFixedPitch: boolean;
}

export interface FontCmapSubtable {
  platformID: number;
  platformName: string;
  encodingID: number;
  format: number;
}

export interface FontNames {
  copyright?: string;
  family?: string;
  subfamily?: string;
  fullName?: string;
  version?: string;
  postScriptName?: string;
  manufacturer?: string;
  designer?: string;
  description?: string;
  license?: string;
  typoFamily?: string;
  typoSubfamily?: string;
}

export interface GlyphEntry {
  id: number;
  svgPath: string;
  isGlyphIndex?: boolean;
  glyphName?: string;
  /** Resolved Unicode character from ToUnicode CMap */
  unicodeChar?: string;
  /** Optional object ref (e.g. CharProc stream) for navigation */
  ref?: import("@pdfjs/core/primitives").Ref;
}

export interface FontInspection {
  format: "TrueType" | "OpenType";
  tables: FontTableEntry[];
  head?: FontHeadInfo;
  hhea?: FontHheaInfo;
  os2?: FontOS2Info;
  post?: FontPostInfo;
  numGlyphs?: number;
  cmapSubtables: FontCmapSubtable[];
  names: FontNames;
  macStyleFlags: string[];
  fsSelectionFlags: string[];
  glyphError?: string;
  hasCmap: boolean;
  cmapRangeCount: number;
  glyphTableLength: number;
  getGlyphSVG: (codePoint: number) => string | null;
  getMappedCodePoints: () => number[];
  getGlyphsByIndex: () => GlyphEntry[];
}

// ── Constants ──────────────────────────────────────────────────────────

const WEIGHT_CLASSES: Record<number, string> = {
  100: "Thin", 200: "Extra-light", 300: "Light", 400: "Normal",
  500: "Medium", 600: "Semi-bold", 700: "Bold", 800: "Extra-bold",
  900: "Black", 950: "Extra-black",
};

const WIDTH_CLASSES: Record<number, string> = {
  1: "Ultra-condensed", 2: "Extra-condensed", 3: "Condensed",
  4: "Semi-condensed", 5: "Medium", 6: "Semi-expanded",
  7: "Expanded", 8: "Extra-expanded", 9: "Ultra-expanded",
};

const MAC_STYLE_FLAGS: [number, string][] = [
  [0x0001, "Bold"], [0x0002, "Italic"], [0x0004, "Underline"],
  [0x0008, "Outline"], [0x0010, "Shadow"], [0x0020, "Condensed"],
  [0x0040, "Extended"],
];

const FS_SELECTION_FLAGS: [number, string][] = [
  [0x0001, "Italic"], [0x0002, "Underscore"], [0x0004, "Negative"],
  [0x0008, "Outlined"], [0x0010, "Strikeout"], [0x0020, "Bold"],
  [0x0040, "Regular"], [0x0080, "Use Typo Metrics"], [0x0100, "WWS"],
  [0x0200, "Oblique"],
];

const PLATFORM_NAMES: Record<number, string> = {
  0: "Unicode", 1: "Macintosh", 3: "Windows",
};

// ── Helpers ────────────────────────────────────────────────────────────

function flagNames(value: number, flags: [number, string][]): string[] {
  return flags.filter(([mask]) => value & mask).map(([, name]) => name);
}

function readFixed32(data: Uint8Array, offset: number): number {
  return readUint32(data, offset) / 65536;
}

function readLongDateTime(data: Uint8Array, offset: number): Date | null {
  const hi = readUint32(data, offset);
  const lo = readUint32(data, offset + 4);
  if (hi === 0 && lo === 0) return null;
  return new Date(Date.UTC(1904, 0, 1) + (hi * 0x100000000 + lo) * 1000);
}


// ── Per-table metadata readers (operate on raw table data bytes) ───────

function parseHead(data: Uint8Array): FontHeadInfo | undefined {
  if (data.length < 54) return undefined;
  return {
    unitsPerEm: readUint16(data, 18),
    created: readLongDateTime(data, 20),
    modified: readLongDateTime(data, 28),
    xMin: readInt16(data, 36),
    yMin: readInt16(data, 38),
    xMax: readInt16(data, 40),
    yMax: readInt16(data, 42),
    macStyle: readUint16(data, 44),
    lowestRecPPEM: readUint16(data, 46),
    indexToLocFormat: readInt16(data, 50),
  };
}

function parseHhea(data: Uint8Array): FontHheaInfo | undefined {
  if (data.length < 36) return undefined;
  return {
    ascender: readInt16(data, 4),
    descender: readInt16(data, 6),
    lineGap: readInt16(data, 8),
    advanceWidthMax: readUint16(data, 10),
    numberOfHMetrics: readUint16(data, 34),
  };
}

function parseOS2(data: Uint8Array): FontOS2Info | undefined {
  if (data.length < 68) return undefined;
  const version = readUint16(data, 0);
  const weightClass = readUint16(data, 4);
  const widthClass = readUint16(data, 6);
  const panose: number[] = [];
  for (let i = 0; i < 10; i++) panose.push(data[32 + i]);
  const result: FontOS2Info = {
    version,
    weightClass,
    weightClassName: WEIGHT_CLASSES[weightClass] ?? `${weightClass}`,
    widthClass,
    widthClassName: WIDTH_CLASSES[widthClass] ?? `${widthClass}`,
    fsSelection: readUint16(data, 62),
    firstCharIndex: readUint16(data, 64),
    lastCharIndex: readUint16(data, 66),
    panose,
    vendorID: readAscii(data, 58, 4),
  };
  if (data.length >= 78) {
    result.typoAscender = readInt16(data, 68);
    result.typoDescender = readInt16(data, 70);
    result.typoLineGap = readInt16(data, 72);
  }
  return result;
}

function parsePost(data: Uint8Array): FontPostInfo | undefined {
  if (data.length < 32) return undefined;
  return {
    format: readFixed32(data, 0),
    italicAngle: readFixed32(data, 4),
    underlinePosition: readInt16(data, 8),
    underlineThickness: readInt16(data, 10),
    isFixedPitch: readUint32(data, 12) !== 0,
  };
}

function parseCmapSubtables(data: Uint8Array): FontCmapSubtable[] {
  if (data.length < 4) return [];
  const numSubtables = readUint16(data, 2);
  const result: FontCmapSubtable[] = [];
  for (let i = 0, p = 4; i < numSubtables; i++, p += 8) {
    if (p + 8 > data.length) break;
    const platformID = readUint16(data, p);
    const encodingID = readUint16(data, p + 2);
    const subtableOffset = readUint32(data, p + 4);
    const format =
      subtableOffset + 2 <= data.length
        ? readUint16(data, subtableOffset)
        : -1;
    result.push({
      platformID,
      platformName: PLATFORM_NAMES[platformID] ?? `Platform ${platformID}`,
      encodingID,
      format,
    });
  }
  return result;
}

// ── Main inspection ────────────────────────────────────────────────────

/**
 * Inspect an embedded TrueType or OpenType font file.
 * Uses the vendored PDF.js helpers for sfnt parsing and glyph compilation.
 */
export function inspectFont(data: Uint8Array): FontInspection | null {
  const stream = new Stream(data);
  if (!isTrueTypeFile(stream) && !isOpenTypeFile(stream)) return null;

  const format: FontInspection["format"] = isOpenTypeFile(stream)
    ? "OpenType"
    : "TrueType";

  // Parse sfnt table directory using the vendored helpers
  const header = readOpenTypeHeader(stream);
  const rawTables = readTables(stream, header.numTables);

  // Build a clean table list for display
  const tables: FontTableEntry[] = [];
  for (const [tag, t] of Object.entries(rawTables)) {
    if (t) tables.push({ tag, checksum: t.checksum, offset: t.offset, length: t.length });
  }

  // Extract metadata from individual tables (using their raw data bytes)
  const head = rawTables.head ? parseHead(rawTables.head.data) : undefined;
  const hhea = rawTables.hhea ? parseHhea(rawTables.hhea.data) : undefined;
  const os2 = rawTables["OS/2"] ? parseOS2(rawTables["OS/2"].data) : undefined;
  const post = rawTables.post ? parsePost(rawTables.post.data) : undefined;
  const cmapSubtables = rawTables.cmap
    ? parseCmapSubtables(rawTables.cmap.data)
    : [];
  const numGlyphs = rawTables.maxp?.data.length >= 6
    ? readUint16(rawTables.maxp.data, 4)
    : undefined;

  // Name table — use the vendored readNameTable (already exported)
  const names: FontNames = {};
  if (rawTables.name) {
    const nameStream = new Stream(data);
    const [parsedNames] = readNameTable(rawTables.name, nameStream) as [
      string[][],
      unknown[],
    ];
    const macNames = parsedNames[0] ?? [];
    const winNames = parsedNames[1] ?? [];
    const get = (id: number) => winNames[id] || macNames[id] || undefined;
    names.copyright = get(0);
    names.family = get(1);
    names.subfamily = get(2);
    names.fullName = get(4);
    names.version = get(5);
    names.postScriptName = get(6);
    names.manufacturer = get(8);
    names.designer = get(9);
    names.description = get(10);
    names.license = get(13);
    names.typoFamily = get(16);
    names.typoSubfamily = get(17);
  }

  const macStyleFlags = head ? flagNames(head.macStyle, MAC_STYLE_FLAGS) : [];
  const fsSelectionFlags = os2
    ? flagNames(os2.fsSelection, FS_SELECTION_FLAGS)
    : [];

  // Compile glyph renderer via the vendored FontRendererFactory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let compiledFont: any = null;
  let glyphError: string | undefined;
  try {
    compiledFont = FontRendererFactory.create(
      { data, fontMatrix: FONT_IDENTITY_MATRIX },
      false,
    );
  } catch (ex) {
    glyphError = `Glyph compilation failed: ${ex instanceof Error ? ex.message : String(ex)}`;
    console.warn("FontInspector:", glyphError, ex);
  }

  function getGlyphSVG(codePoint: number): string | null {
    if (!compiledFont?.cmap) return null;
    try {
      const ch = String.fromCodePoint(codePoint);
      const { glyphId } = lookupCmap(compiledFont.cmap, ch);
      if (glyphId === 0) return null;
      const path = compiledFont.getPathJs(ch);
      if (!path || path === "Z") return null;
      if (!/[LCQT]/i.test(path)) return null;
      return path;
    } catch {
      return null;
    }
  }

  function getMappedCodePoints(): number[] {
    if (!compiledFont?.cmap) return [];
    const cps: number[] = [];
    for (const range of compiledFont.cmap as { start: number; end: number }[]) {
      for (let cp = range.start; cp <= range.end; cp++) {
        const { glyphId } = lookupCmap(compiledFont.cmap, String.fromCodePoint(cp));
        if (glyphId > 0) cps.push(cp);
        if (cps.length >= 10_000) return cps;
      }
    }
    return cps;
  }

  function getGlyphsByIndex(): GlyphEntry[] {
    if (!compiledFont?.glyphs) return [];
    const entries: GlyphEntry[] = [];
    for (let i = 1; i < compiledFont.glyphs.length; i++) {
      try {
        const glyph = compiledFont.glyphs[i];
        if (!glyph?.length) continue;
        const path = compiledFont.compileGlyph(glyph, i);
        if (!path || path === "Z") continue;
        if (!/[LCQT]/i.test(path)) continue;
        entries.push({ id: i, svgPath: path, isGlyphIndex: true });
        if (entries.length >= 512) break;
      } catch {
        continue;
      }
    }
    return entries;
  }

  const cmapRanges = compiledFont?.cmap as
    | { start: number; end: number }[]
    | undefined;
  const glyphTableLength = compiledFont?.glyphs?.length ?? 0;

  return {
    format,
    tables,
    head,
    hhea,
    os2,
    post,
    numGlyphs,
    cmapSubtables,
    names,
    macStyleFlags,
    fsSelectionFlags,
    glyphError,
    hasCmap: !!cmapRanges,
    cmapRangeCount: cmapRanges?.length ?? 0,
    glyphTableLength,
    getGlyphSVG,
    getMappedCodePoints,
    getGlyphsByIndex,
  };
}

// ── CFF (Type1C / CIDFontType0C) inspection ───────────────────────────

export interface CFFInspection {
  format: "Type 1" | "Type 1 (CID)";
  header: { major: number; minor: number; hdrSize: number; offSize: number };
  fontName?: string;
  identityEntries: [string, string][];
  metricsEntries: [string, string][];
  notice?: string;
  numGlyphs: number;
  isCIDFont: boolean;
  glyphError?: string;
  getGlyphsByIndex: () => GlyphEntry[];
}

function cffSidString(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strings: any,
  sid: number | undefined | null,
): string | undefined {
  if (sid == null) return undefined;
  try {
    return strings.get(sid);
  } catch {
    return undefined;
  }
}

/**
 * Inspect bare CFF (Compact Font Format) data, typically from FontFile3
 * entries with Subtype Type1C or CIDFontType0C.
 */
export function inspectCFFFont(data: Uint8Array): CFFInspection | null {
  if (!isCFFFile(data)) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cff: any;
  try {
    const parser = new CFFParser(new Stream(data), {}, false);
    cff = parser.parse();
  } catch (ex) {
    console.warn("CFF parse failed:", ex);
    return null;
  }

  const header = {
    major: cff.header?.major ?? data[0],
    minor: cff.header?.minor ?? data[1],
    hdrSize: cff.header?.hdrSize ?? data[2],
    offSize: cff.header?.offSize ?? data[3],
  };

  const fontName = cff.names?.[0] ?? undefined;
  const topDict = cff.topDict;
  const strings = cff.strings;

  // Helpers to extract SID strings and numeric values from the top dict
  const getSid = (name: string): string | undefined => {
    const sid = topDict?.getByName(name);
    return cffSidString(strings, sid);
  };
  const getNum = (name: string): number | undefined => {
    try {
      const val = topDict?.getByName(name);
      return val != null && val !== 0 ? val : undefined;
    } catch { return undefined; }
  };

  const numGlyphs = cff.charStrings?.count ?? 0;

  // ── Identity (concise header) ──
  const identityEntries: [string, string][] = [];
  const fullName = getSid("FullName");
  const familyName = getSid("FamilyName");
  if (fullName) identityEntries.push(["Full Name", fullName]);
  else if (familyName) identityEntries.push(["Family", familyName]);
  const version = getSid("version");
  if (version) identityEntries.push(["Version", version]);
  identityEntries.push(["Glyphs", String(numGlyphs)]);
  const weight = getSid("Weight");
  if (weight) identityEntries.push(["Weight", weight]);
  const copyright = getSid("Copyright");
  if (copyright) identityEntries.push(["Copyright", copyright]);

  // ── Metrics (detailed, shown below glyphs) ──
  const metricsEntries: [string, string][] = [];

  if (fullName && familyName) metricsEntries.push(["Family", familyName]);
  const notice = getSid("Notice");

  const fontBBox = topDict?.getByName("FontBBox");
  if (fontBBox && Array.isArray(fontBBox) && fontBBox.some((v: number) => v !== 0)) {
    metricsEntries.push(["Bounding Box", `[${fontBBox.join(", ")}]`]);
  }

  const fontMatrix = topDict?.getByName("FontMatrix");
  if (fontMatrix && Array.isArray(fontMatrix)) {
    metricsEntries.push(["FontMatrix", `[${fontMatrix.map((v: number) => v.toPrecision(4)).join(", ")}]`]);
  }

  const italicAngle = getNum("ItalicAngle");
  if (italicAngle != null) metricsEntries.push(["Italic Angle", `${italicAngle}°`]);
  const isFixed = topDict?.getByName("isFixedPitch");
  if (isFixed) metricsEntries.push(["Fixed Pitch", "Yes"]);

  const ulPos = getNum("UnderlinePosition");
  const ulThick = getNum("UnderlineThickness");
  if (ulPos != null || ulThick != null) {
    metricsEntries.push(["Underline", `pos ${ulPos ?? -100}, thickness ${ulThick ?? 50}`]);
  }

  const charstringType = getNum("CharstringType");
  if (charstringType != null) metricsEntries.push(["Charstring Type", String(charstringType)]);
  const paintType = getNum("PaintType");
  if (paintType != null) metricsEntries.push(["Paint Type", String(paintType)]);
  const strokeWidth = getNum("StrokeWidth");
  if (strokeWidth != null) metricsEntries.push(["Stroke Width", String(strokeWidth)]);

  if (cff.isCIDFont) {
    getSid("ROS") && metricsEntries.push(["CID Registry", getSid("ROS")!]);
    const cidVer = getNum("CIDFontVersion");
    if (cidVer != null) metricsEntries.push(["CID Font Version", String(cidVer)]);
    const cidCount = getNum("CIDCount");
    if (cidCount != null) metricsEntries.push(["CID Count", String(cidCount)]);
    metricsEntries.push(["FDArray Size", String(cff.fdArray?.length ?? 0)]);
  }

  metricsEntries.push(["Header", `v${header.major}.${header.minor}, hdrSize=${header.hdrSize}, offSize=${header.offSize}`]);
  const charsetFormat = cff.charset?.format;
  if (charsetFormat != null) metricsEntries.push(["Charset Format", String(charsetFormat)]);
  if (cff.encoding) {
    const enc = cff.encoding.predefined
      ? `Predefined (${cff.encoding.format})`
      : `Custom (format ${cff.encoding.format})`;
    metricsEntries.push(["Encoding", enc]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let compiledFont: any = null;
  let glyphError: string | undefined;
  try {
    const cffInfo = {
      glyphs: cff.charStrings.objects,
      subrs: cff.topDict.privateDict?.subrsIndex?.objects,
      gsubrs: cff.globalSubrIndex?.objects,
      isCFFCIDFont: cff.isCIDFont,
      fdSelect: cff.fdSelect,
      fdArray: cff.fdArray,
    };
    compiledFont = FontRendererFactory.createFromCFF(
      cffInfo,
      null,
      fontMatrix ?? FONT_IDENTITY_MATRIX,
    );
  } catch (ex) {
    glyphError = `Glyph compilation failed: ${ex instanceof Error ? ex.message : String(ex)}`;
    console.warn("CFF glyph compilation:", glyphError, ex);
  }

  function getGlyphsByIndex(): GlyphEntry[] {
    if (!compiledFont?.glyphs) return [];
    const entries: GlyphEntry[] = [];
    for (let i = 1; i < compiledFont.glyphs.length; i++) {
      try {
        const glyph = compiledFont.glyphs[i];
        if (!glyph?.length) continue;
        const path = compiledFont.compileGlyph(glyph, i);
        if (!path || path === "Z") continue;
        if (!/[LCQT]/i.test(path)) continue;
        entries.push({ id: i, svgPath: path, isGlyphIndex: true });
        if (entries.length >= 512) break;
      } catch {
        continue;
      }
    }
    return entries;
  }

  return {
    format: cff.isCIDFont ? "Type 1 (CID)" : "Type 1",
    header,
    fontName,
    identityEntries,
    metricsEntries,
    notice,
    numGlyphs,
    isCIDFont: cff.isCIDFont,
    glyphError,
    getGlyphsByIndex,
  };
}

// ── PFB (bare Type 1) inspection ───────────────────────────────────────

function extractPFBFontName(data: Uint8Array): string | undefined {
  const headerLen = Math.min(data.length, 4096);
  const text = new TextDecoder("ascii", { fatal: false }).decode(
    data.subarray(0, headerLen),
  );
  const match = text.match(/\/FontName\s+\/(\S+)/);
  return match?.[1];
}

/**
 * Inspect a bare PFB (Type 1) font file. Converts to CFF via the vendor's
 * Type1Font class, then delegates to inspectCFFFont for the actual inspection.
 */
export function inspectType1Font(data: Uint8Array): CFFInspection | null {
  if (data.length < 6 || data[0] !== 0x80 || data[1] !== 0x01) return null;

  const fontName = extractPFBFontName(data) ?? "Type1Font";

  try {
    const stream = new Stream(data);
    const properties = {
      length1: data.length,
      length2: 0,
      fontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      bbox: [0, 0, 0, 0],
      privateData: {},
    };
    const t1font = new Type1Font(fontName, stream, properties);
    const cffData = new Uint8Array(t1font.data);
    return inspectCFFFont(cffData);
  } catch (ex) {
    console.warn("Type 1 PFB inspection failed:", ex);
    return null;
  }
}

// ── Normalized view model ─────────────────────────────────────────────

export type NormalizedFont = {
  format: string;
  badgeColor: string;
  displayName?: string;
  extraBadges: { label: string; color: string }[];
  identityRows: [string, string][];
  metricsRows: [string, string][];
  glyphError?: string;

  hasCmap: boolean;
  getGlyphSVG: (codePoint: number) => string | null;
  getMappedCodePoints: () => number[];
  getGlyphsByIndex: () => GlyphEntry[];

  viewBox: string;
  yMax: number;

  notice?: string;
  tables?: FontTableEntry[];
  cmapSubtables?: FontCmapSubtable[];
};

export const BADGE_COLORS: Record<string, string> = {
  TrueType: "bg-emerald-100 text-emerald-800",
  OpenType: "bg-sky-100 text-sky-800",
  "Type 1": "bg-violet-100 text-violet-800",
  "Type 1 (CID)": "bg-violet-100 text-violet-800",
  "Type 3": "bg-orange-100 text-orange-800",
};

// ── Detection helpers ──────────────────────────────────────────────────
