/**
 * Thin wrapper around PDF.js's CMap parser for inspecting ToUnicode streams.
 */
import { CMap, parseCMap } from "@pdfjs/core/cmap";
import { Lexer } from "@pdfjs/core/parser";
import { Stream } from "@pdfjs/core/stream";

export interface CMapMapping {
  code: number;
  codeHex: string;
  unicode: string;
  char: string;
}

export interface CMapCodespaceRange {
  low: string;
  high: string;
  bytes: number;
}

export interface ParsedCMap {
  name: string;
  vertical: boolean;
  codespaceRanges: CMapCodespaceRange[];
  mappings: CMapMapping[];
}

function intToHex(n: number, width: number): string {
  return n.toString(16).toUpperCase().padStart(width * 2, "0");
}

/**
 * Decode a CMap destination value (stored as a raw byte-string by PDF.js)
 * into a displayable Unicode string.
 */
function decodeDestination(dst: string | number): string {
  if (typeof dst === "number") {
    return String.fromCodePoint(dst);
  }
  const codePoints: number[] = [];
  for (let i = 0; i < dst.length; i++) {
    const hi = dst.charCodeAt(i);
    if (hi >= 0xd800 && hi <= 0xdbff && i + 1 < dst.length) {
      const lo = dst.charCodeAt(i + 1);
      codePoints.push(((hi - 0xd800) << 10) + (lo - 0xdc00) + 0x10000);
      i++;
    } else {
      codePoints.push(hi);
    }
  }
  return codePoints.map((cp) => String.fromCodePoint(cp)).join("");
}

function destinationHex(dst: string | number): string {
  if (typeof dst === "number") {
    return dst.toString(16).toUpperCase().padStart(4, "0");
  }
  let hex = "";
  for (let i = 0; i < dst.length; i++) {
    hex += dst.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return hex;
}

/**
 * Parse a ToUnicode CMap stream using PDF.js internals, returning a
 * structured object suitable for display.
 */
export async function inspectCMap(
  data: Uint8Array,
): Promise<ParsedCMap | null> {
  try {
    const stream = new Stream(data);
    const lexer = new Lexer(stream);
    const cmap: InstanceType<typeof CMap> = await parseCMap(
      new CMap(),
      lexer,
      null,
      null,
    );

    // Determine byte-width of codes from the codespace ranges
    let codeBytes = 1;
    for (let n = cmap.codespaceRanges.length - 1; n >= 0; n--) {
      if (cmap.codespaceRanges[n].length > 0) {
        codeBytes = n + 1;
        break;
      }
    }

    const codespaceRanges: CMapCodespaceRange[] = [];
    for (let n = 0; n < cmap.codespaceRanges.length; n++) {
      const pairs = cmap.codespaceRanges[n];
      const bytes = n + 1;
      for (let k = 0; k < pairs.length; k += 2) {
        codespaceRanges.push({
          low: intToHex(pairs[k], bytes),
          high: intToHex(pairs[k + 1], bytes),
          bytes,
        });
      }
    }

    const mappings: CMapMapping[] = [];
    cmap.forEach((code: number, dst: string | number) => {
      mappings.push({
        code,
        codeHex: intToHex(code, codeBytes),
        unicode: "U+" + destinationHex(dst),
        char: decodeDestination(dst),
      });
    });
    mappings.sort((a, b) => a.code - b.code);

    return {
      name: cmap.name || "",
      vertical: cmap.vertical,
      codespaceRanges,
      mappings,
    };
  } catch (e) {
    console.warn("CMap inspection failed:", e);
    return null;
  }
}