import type { ObjectEntry } from "@/lib/loadPDF";
import { BaseStream } from "@pdfjs/core/base_stream";
import { FlateStream } from "@pdfjs/core/flate_stream";
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

function suffix(entry: ObjectEntry, name?: string): string {
  if (entry.nameHint && name !== entry.nameHint) {
    return ` (${entry.nameHint})`;
  }
  if (!entry.backlinks) return "";
  const firstWithHint = entry.backlinks.find(
    (backlink) => backlink.hint !== undefined,
  );
  if (!firstWithHint || name === firstWithHint.hint) return "";
  return ` (${firstWithHint?.hint})`;
}

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
      if (name?.name) {
        return `${prefix(val)}${name.name}${suffix(val, name.name)}`;
      }
      return `${prefix(val)}Dict` + `${suffix(val)}`;
    }
    case val.val instanceof BaseStream: {
      if ("dict" in val.val) {
        const dictVal = val.val.dict as Dict | undefined;
        const name = dictVal?.get("Type");
        const subtype = dictVal?.get("Subtype");
        if (name?.name) {
          return `${prefix(val)}${name.name}${suffix({ ...val, nameHint: subtype?.name ?? val.nameHint }, name.name)}`;
        }
        if (subtype?.name) {
          return `${prefix(val)}${subtype.name}${suffix(val, subtype.name)}`;
        }
        // Special case for ICC profiles
        const n = dictVal?.get("N");
        if (typeof n === "number" && (n === 1 || n === 3 || n === 4)) {
          const csName = n === 1 ? "Gray" : n === 3 ? "RGB" : "CMYK";
          return `${prefix(val)}ICC Profile (${csName})${suffix(val)}`;
        }
      }
      return `${prefix(val)}${val.val instanceof FlateStream ? "FlateStream" : "Stream"}${suffix(
        val,
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
