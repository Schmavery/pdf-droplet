/**
 * Detection helpers for identifying the type of a PDF stream's content.
 */
import { readUint32 } from "@pdfjs/core/core_utils";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Name } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";
import type { PDFVal } from "@/lib/loadPDF";

// ── Images ──────────────────────────────────────────────────────────────

/** Check if a stream value is an Image XObject (Subtype /Image in its dict). */
export function isImageXObject(val: PDFVal): val is FlateStream | Stream {
  if (!(val instanceof FlateStream) && !(val instanceof Stream)) return false;
  const dict = val.dict;
  if (!dict) return false;
  const subtype = dict.get("Subtype");
  return subtype instanceof Name && subtype.name === "Image";
}

// ── ICC profiles ────────────────────────────────────────────────────────

/** Check for the 'acsp' signature at offset 36, which identifies an ICC profile. */
export function isICCProfile(data: Uint8Array): boolean {
  if (data.length < 128) return false;
  return (
    data[36] === 0x61 && // 'a'
    data[37] === 0x63 && // 'c'
    data[38] === 0x73 && // 's'
    data[39] === 0x70 // 'p'
  );
}

// ── Fonts ───────────────────────────────────────────────────────────────

const SFNT_TRUETYPE = 0x00010000;
const SFNT_OPENTYPE = 0x4f54544f;
const SFNT_TTC = 0x74746366;
const SFNT_WOFF = 0x774f4646;

/** Quick magic-number check for embedded font data. */
export function isFontFile(data: Uint8Array): boolean {
  if (data.length < 12) return false;
  const magic = readUint32(data, 0);
  if (
    magic === SFNT_TRUETYPE ||
    magic === SFNT_OPENTYPE ||
    magic === SFNT_TTC ||
    magic === SFNT_WOFF
  ) {
    return true;
  }
  // PFB (Type 1) header
  if (data[0] === 0x80 && data[1] === 0x01) return true;
  if (isCFFFile(data)) return true;
  return false;
}

/**
 * Detect bare CFF (Compact Font Format) data, used by FontFile3 entries
 * with Subtype Type1C or CIDFontType0C. CFF starts with a header where
 * byte 0 is the major version (1), byte 1 is the minor version (0),
 * byte 2 is the header size (typically 4), and byte 3 is the offSize (1–4).
 */
export function isCFFFile(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  const major = data[0];
  const minor = data[1];
  const hdrSize = data[2];
  const offSize = data[3];
  return (
    major === 1 &&
    minor === 0 &&
    hdrSize >= 4 &&
    offSize >= 1 &&
    offSize <= 4
  );
}

// ── CMaps ───────────────────────────────────────────────────────────────

/** Returns true if the bytes look like a CMap (contains "begincmap"). */
export function isCMap(data: Uint8Array): boolean {
  if (data.length < 20) return false;
  const text = new TextDecoder("ascii").decode(
    data.subarray(0, Math.min(data.length, 512)),
  );
  return text.includes("begincmap");
}