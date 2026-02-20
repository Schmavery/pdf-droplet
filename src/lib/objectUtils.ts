import type { ObjectEntry } from "@/lib/loadPDF";
import { BaseStream } from "@pdfjs/core/base_stream";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, isRefsEqual, Ref } from "@pdfjs/core/primitives";

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
        // Special case for embedded font files via backlink hint
        const fontHint = val.backlinks?.find(
          (b) =>
            b.hint === "FontFile" ||
            b.hint === "FontFile2" ||
            b.hint === "FontFile3",
        )?.hint;
        if (fontHint) {
          const fontType =
            fontHint === "FontFile"
              ? "Type 1"
              : fontHint === "FontFile2"
                ? "TrueType"
                : "CFF/OpenType";
          return `${prefix(val)}Font (${fontType})${suffix(val, fontHint)}`;
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

/** Check backlinks for ToUnicode / Encoding hints that indicate a CMap stream. */
export function getCMapHint(
  backlinks?: { ref: unknown; hint?: string }[],
): string | undefined {
  return backlinks?.find(
    (b) => b.hint === "ToUnicode" || b.hint === "Encoding",
  )?.hint;
}

/** Check backlinks for CIDSet hint (from a FontDescriptor). */
export function getCIDSetHint(
  backlinks?: { ref: unknown; hint?: string }[],
): string | undefined {
  return backlinks?.find((b) => b.hint === "CIDSet")?.hint;
}

/** Check backlinks for FontFile / FontFile2 / FontFile3 hints. */
export function getFontFileHint(
  backlinks?: { ref: unknown; hint?: string }[],
): string | undefined {
  return backlinks?.find(
    (b) =>
      b.hint === "FontFile" || b.hint === "FontFile2" || b.hint === "FontFile3",
  )?.hint;
}

// ── Filter ──────────────────────────────────────────────────────────────

export function getTypeName(entry: ObjectEntry): string | undefined {
  if (entry.val instanceof Dict) {
    return entry.val.get("Type")?.name;
  }
  if (entry.val instanceof BaseStream && "dict" in entry.val) {
    return (entry.val.dict as Dict | undefined)?.get("Type")?.name;
  }
  return undefined;
}

export function getSubtypeName(entry: ObjectEntry): string | undefined {
  if (entry.val instanceof Dict) {
    return entry.val.get("Subtype")?.name;
  }
  if (entry.val instanceof BaseStream && "dict" in entry.val) {
    return (entry.val.dict as Dict | undefined)?.get("Subtype")?.name;
  }
  return undefined;
}

export type FilterOption = {
  id: string;
  label: string;
  predicate: (entry: ObjectEntry) => boolean;
};

function isPrimitive(e: ObjectEntry): boolean {
  return (
    e.val === null ||
    typeof e.val === "boolean" ||
    typeof e.val === "number" ||
    typeof e.val === "string" ||
    e.val instanceof Array ||
    e.val instanceof Ref
  );
}

const CATEGORIZED_FILTERS: FilterOption[] = [
  {
    id: "page",
    label: "Page",
    predicate: (e) => getTypeName(e) === "Page",
  },
  {
    id: "font",
    label: "Font",
    predicate: (e) => {
      const type = getTypeName(e);
      return (
        type === "Font" ||
        type === "FontDescriptor" ||
        !!getFontFileHint(e.backlinks)
      );
    },
  },
  {
    id: "image",
    label: "Image",
    predicate: (e) => getSubtypeName(e) === "Image",
  },
  {
    id: "form-xobject",
    label: "Form XObject",
    predicate: (e) => getSubtypeName(e) === "Form",
  },
  {
    id: "struct",
    label: "Struct Tree",
    predicate: (e) => {
      const type = getTypeName(e);
      return type === "StructTreeRoot" || type === "StructElem";
    },
  },
  {
    id: "in-objstm",
    label: "In ObjStm",
    predicate: (e) => !!e.fromObjStm,
  },
  {
    id: "primitive",
    label: "Primitives",
    predicate: isPrimitive,
  },
];

export const FILTER_OPTIONS: FilterOption[] = [
  ...CATEGORIZED_FILTERS,
  {
    id: "other",
    label: "Other",
    predicate: (e) => !CATEGORIZED_FILTERS.some((f) => f.predicate(e)),
  },
];

export function applyFilters(
  objects: ObjectEntry[],
  activeFilters: Set<string>,
  alwaysInclude?: Ref,
): ObjectEntry[] {
  if (activeFilters.size === FILTER_OPTIONS.length) return objects;
  const excluded = FILTER_OPTIONS.filter((f) => !activeFilters.has(f.id));
  return objects.filter(
    (entry) =>
      (alwaysInclude && isRefsEqual(entry.ref, alwaysInclude)) ||
      !excluded.some((p) => p.predicate(entry)),
  );
}

// ── Sort ────────────────────────────────────────────────────────────────

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
