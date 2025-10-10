import type { ObjectEntry } from "@/lib/loadPDF";
import { BaseStream } from "@pdfjs/core/base_stream";
import { Dict, Ref } from "@pdfjs/core/primitives";

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

// export function objectSizeBytes(val: PDFVal): number {
//   if (val instanceof FlateStream) {
//     return val.bufferLength;
//   } else if (val instanceof Stream) {
//     return val?.length ?? 0;
//   } else if (val instanceof Dict) {
//     let totalSize = 0;
//     for (const [key, value] of val._map.entries()) {
//       totalSize += key.length;
//       totalSize += objectSizeBytes(value);
//     }
//     return totalSize;
//   } else if (Array.isArray(val)) {
//     return val.reduce((acc, item) => acc + objectSizeBytes(item), 0);
//   } else if (typeof val === "string") {
//     return val.length;
//   } else if (val instanceof Ref) {
//     return `${val.num} ${val.gen} R`.length;
//   } else if (val === null) {
//     return 4; // assuming 4 bytes for null representation ("null" string length)
//   } else if (typeof val === "boolean") {
//     return val ? 4 : 5; // assuming 4 bytes for "true" and 5 bytes for "false"
//   } else if (val instanceof Name) {
//     return val.name.length;
//   } else if (typeof val === "number") {
//     return 8; // assuming 8 bytes for a number
//   }
//   console.warn("Unknown PDFVal type for size calculation", val);
//   return 0;
// }

export function getObjectSizeString(val: ObjectEntry): string {
  const sizeBytes = val.streamRange.end - val.streamRange.start;
  if (sizeBytes < 1000) {
    return `${(sizeBytes / 1000).toFixed(2)}kB`;
  }
  return `${(sizeBytes / 1000).toFixed(1)}kB`;
}

export function getObjectType(val: ObjectEntry): string {
  switch (true) {
    case val.val === null:
      return `${prefix(val)}null${suffix(val)}`;
    case typeof val.val == "boolean":
      return `${prefix(val)}Boolean${suffix(val)}`;
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
        return `${prefix(val)}${name}${suffix(val)}`;
      }
      return `${prefix(val)}Dict` + `${suffix(val)}`;
    }
    case val.val instanceof BaseStream: {
      if ("dict" in val.val) {
        const dictVal = val.val.dict as Dict | undefined;
        const name = dictVal?.get("Type");
        if (name) {
          return `${prefix(val)}${name}`;
        }
      }
      return `${prefix(val)}${val.val.constructor.name ?? "Stream"}${suffix(
        val
      )}`;
    }
    default:
      console.warn("Unknown object type", val);
      return `${prefix(val)}unknown${suffix(val)}`;
  }
}

export type SortValue = {
  row: "PAGE" | "SIZE" | "OBJ";
  dir: "ASC" | "DESC";
};

export const DEFAULT_SORT = { row: "OBJ", dir: "ASC" } as const;

function getSortValue(o: ObjectEntry, row: SortValue["row"]) {
  switch (row) {
    case "PAGE":
      return o.pageIndex;
    case "SIZE":
      return o.streamRange.end - o.streamRange.start;
    case "OBJ":
      return o.ref.num;
  }
}

export function makeSortComparator(sort: SortValue) {
  return (a: ObjectEntry, b: ObjectEntry): number => {
    const key = sort.row;
    let result = 0;

    const av = getSortValue(a, key);
    const bv = getSortValue(b, key);

    if (typeof av === "number" && typeof bv === "number") {
      result = av - bv;
    } else {
      result = String(av).localeCompare(String(bv));
    }

    return sort.dir === "ASC" ? result : -result;
  };
}
