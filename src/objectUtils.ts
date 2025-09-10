import type { ObjectEntry, PDFVal } from "@/loadPDF";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Name, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";

const NUMBER_CHARS = [..."❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴"];

function prefix(entry: ObjectEntry): string {
  if (entry.pageIndex == undefined) {
    return "";
  }
  if (entry.pageIndex >= 20) {
    return `${entry.pageIndex} `;
  }
  return NUMBER_CHARS[entry.pageIndex] + " ";
}

function suffix(entry: ObjectEntry): string {
  if (entry.nameHint) {
    return ` (${entry.nameHint})`;
  }
  if (!entry.backlinks) return "";
  const firstWithHint = entry.backlinks.find(
    (backlink) => backlink.hint !== undefined
  );
  if (!firstWithHint) return "";
  return ` (${firstWithHint?.hint})`;
}

export function objectSizeBytes(val: PDFVal): number {
  if (val instanceof FlateStream) {
    return val.bufferLength;
  } else if (val instanceof Stream) {
    return val?.length ?? 0;
  } else if (val instanceof Dict) {
    let totalSize = 0;
    for (const [key, value] of val._map.entries()) {
      totalSize += key.length;
      totalSize += objectSizeBytes(value);
    }
    return totalSize;
  } else if (Array.isArray(val)) {
    return val.reduce((acc, item) => acc + objectSizeBytes(item), 0);
  } else if (typeof val === "string") {
    return val.length;
  } else if (val instanceof Ref) {
    return `${val.num} ${val.gen} R`.length;
  } else if (val === null) {
    return 4; // assuming 4 bytes for null representation ("null" string length)
  } else if (typeof val === "boolean") {
    return val ? 4 : 5; // assuming 4 bytes for "true" and 5 bytes for "false"
  } else if (val instanceof Name) {
    return val.name.length;
  } else if (typeof val === "number") {
    return 8; // assuming 8 bytes for a number
  }
  console.warn("Unknown PDFVal type for size calculation", val);
  return 0;
}

export function getObjectSizeString(val: ObjectEntry): string {
  const objectDefinitionOverheadBytes =
    `${val.ref.num} ${val.ref.gen} obj endobj`.length; // Rough overhead for object definition
  const sizeBytes = objectSizeBytes(val.val) + objectDefinitionOverheadBytes;
  if (sizeBytes < 1000) {
    return `${(sizeBytes / 1000).toFixed(2)}kB`;
  }
  return `${(sizeBytes / 1000).toFixed(1)}kB`;
}

export function getObjectType(val: ObjectEntry): string {
  switch (true) {
    case val.val === null:
      return `${prefix(val)}null${suffix(val)}`;
    case typeof val.val === "number":
      return `${prefix(val)}Number${suffix(val)}`;
    case typeof val.val === "string":
      return `${prefix(val)}String${suffix(val)}`;
    case val.val instanceof Array:
      return `${prefix(val)}Array${suffix(val)}`;
    case val.val instanceof Ref:
      return `${prefix(val)}Ref${suffix(val)}`;
    case val.val instanceof Dict: {
      const name = val.val.get("Type");
      if (name) {
        return `${prefix(val)}${name}`;
      }
      return `${prefix(val)}Dict` + `${suffix(val)}`;
    }
    case val.val instanceof Stream: {
      return `${prefix(val)}Stream${suffix(val)}`;
    }
    case val.val instanceof FlateStream: {
      return `${prefix(val)}FlateStream${suffix(val)}`;
    }
    default:
      return `${prefix(val)}unknown${suffix(val)}`;
  }
}
