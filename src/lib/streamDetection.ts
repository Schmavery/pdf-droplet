/**
 * Detection helpers for identifying the type of a PDF stream's content.
 */
import { readUint32 } from "@pdfjs/core/core_utils";

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
  if (data[0] === 0x80 && data[1] === 0x01) return true;
  if (data[0] === 1 && data[1] === 0 && data.length > 4) return true;
  return false;
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