import type { BaseStream } from "@pdfjs/core/base_stream";
import { RESOURCES_KEYS_OPERATOR_LIST } from "@pdfjs/core/core_utils";
import type { Page, PDFDocument } from "@pdfjs/core/document";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { OperatorList } from "@pdfjs/core/operator_list";
import { CIRCULAR_REF, Dict, isRefsEqual, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";
import { FontFaceObject, FontLoader } from "@pdfjs/display/font_loader";
import { PDFObjects } from "@pdfjs/display/pdf_objects";
import { bytesToString } from "@pdfjs/shared/util";

export const FONT_LOADER = new FontLoader({ ownerDocument: document });
export const PDF_COMMON_OBJECTS = new PDFObjects();

export type PDFVal =
  | Dict
  | BaseStream
  | null
  | number
  | string
  | typeof CIRCULAR_REF;

export type Backlink = {
  ref: Ref;
  hint?: string;
};

// TODO: add a ref to the containing page
// TODO: for pages, preparse the content stream and store the operator list in the object entry
// and maybe the viewport also for easier rendering
// then render the relevant page in the PdfView when the object is selected
// later, when we allow editing the content stream, we might need a way to reset
export type ObjectEntry = {
  ref: Ref;
  val: PDFVal;
  nameHint?: string;
  pageIndex?: number;
  backlinks?: Backlink[];
  streamRange: { start: number; end: number };
};

// export type ObjectMap = Map<Ref, ObjectEntry>;
export class ObjectMap {
  private map = new Map<string, ObjectEntry>();
  constructor() {}
  add(value: ObjectEntry) {
    this.map.set(value.ref.toString(), value);
  }
  get(key: Ref): ObjectEntry | undefined {
    return this.map.get(key.toString());
  }
  has(key: Ref): boolean {
    return this.map.has(key.toString());
  }
  values(): IterableIterator<ObjectEntry> {
    return this.map.values();
  }
  static fromObjectEntries(entries: ObjectEntry[]) {
    const objMap = new ObjectMap();
    entries.forEach((e) => objMap.add(e));
    return objMap;
  }
  get size(): number {
    return this.map.size;
  }
}

export function findRefs(val: PDFVal, hint?: string) {
  const refs: { ref: Ref; hint?: string }[] = [];
  if (val instanceof Ref) {
    refs.push({ ref: val, hint });
  } else if (val instanceof Dict) {
    for (const [k, v] of val._map.entries()) {
      refs.push(...findRefs(v, k));
    }
  } else if (Array.isArray(val)) {
    for (const v of val) {
      refs.push(...findRefs(v));
    }
  } else if (val && (val instanceof FlateStream || val instanceof Stream)) {
    const dictVal = val.dict;
    if (dictVal) refs.push(...findRefs(dictVal));
  }
  return refs;
}

// Should be called with backlinks populated for all objects in the document
export function populateAncestorPageIndex(
  target: Ref,
  objects: ObjectEntry[],
  pagesArray: Ref[],
  visited = new Set<string>()
) {
  if (visited.has(target.toString())) {
    return;
  }
  visited.add(target.toString());

  const targetObject = objects.find((o) => isRefsEqual(o.ref, target));
  if (!targetObject) {
    console.warn(`No ObjectEntry found for target ref: ${target.toString()}`);
    return;
  }
  if (targetObject.pageIndex !== undefined) {
    console.log(".....");
    return;
  }
  const pageIndex = pagesArray.findIndex((pageRef) =>
    isRefsEqual(pageRef, target)
  );
  if (pageIndex != -1) {
    console.log("found page for dict");
    return (targetObject.pageIndex = pageIndex);
  }

  targetObject.backlinks?.forEach((backlink) => {
    populateAncestorPageIndex(backlink.ref, objects, pagesArray, visited);
  });

  const ancestorPageIndexSet = new Set(
    targetObject.backlinks
      ?.map((backlink) =>
        objects.find((obj) => isRefsEqual(obj.ref, backlink.ref))
      )
      .map((entry) => entry?.pageIndex)
      .filter((v) => v !== undefined)
  );

  if (ancestorPageIndexSet.size == 1) {
    targetObject.pageIndex = ancestorPageIndexSet.values().next().value;
  }
}

// const gEndobjRegExp = /\b(endobj|\d+\s+\d+\s+obj|xref|trailer\s*<<)\b/g;
function findEndOfObjPos(streamStr: string, startPos: number): number {
  const gEndobjRegExp = /endobj/g;
  gEndobjRegExp.lastIndex = startPos;
  const match = gEndobjRegExp.exec(streamStr);
  if (match) {
    return gEndobjRegExp.lastIndex;
  } else {
    console.log("Couldn't find endobj", startPos, streamStr.length);
    return streamStr.length;
  }
}

export function loadAllObjects(doc: PDFDocument, stream: Stream): ObjectMap {
  const buffer = stream.bytes;
  console.log(buffer);
  const bufferStr = bytesToString(buffer);

  console.log(doc.xref.entries);
  const entries = Object.entries(doc.xref.entries)
    .slice(1)
    .map(([key, value]) => {
      const ref = new Ref(parseInt(key), value.gen);
      const val = doc.xref.fetch(ref);
      if (val instanceof Stream || val instanceof FlateStream) {
        val.getBytes();
      }
      const start = value.offset;
      const endOfObjPos = findEndOfObjPos(bufferStr, start);
      return {
        ref,
        val,
        backlinks: [],
        streamRange: {
          start: value.offset,
          end: endOfObjPos,
        },
      } as ObjectEntry;
    }) as ObjectEntry[];
  const backlinksIndex = Object.fromEntries(
    entries.map((entry) => [entry.ref.toString(), findRefs(entry.val)])
  );
  entries.forEach((entry) => {
    entry.backlinks = entries.flatMap((e) => {
      const links = backlinksIndex[e.ref.toString()];
      const match = links.find((link) => isRefsEqual(link.ref, entry.ref));
      return match ? { ref: e.ref, hint: match.hint } : [];
    });
  });
  const infoRef = doc.xref.trailer?.getRaw("Info") as Ref | undefined;
  if (infoRef) {
    entries.forEach((e) => {
      if (isRefsEqual(e.ref, infoRef)) {
        e.nameHint = "Info";
      }
    });
  }

  const pagesArray = doc.catalog?.toplevelPagesDict?.get("Kids") as
    | Ref[]
    | undefined;
  console.log("Pages array found in catalog:", pagesArray);
  if (pagesArray && Array.isArray(pagesArray)) {
    entries.forEach((entry) => {
      populateAncestorPageIndex(entry.ref, entries, pagesArray);
    });
  }
  console.log("loaded entries", entries);
  return ObjectMap.fromObjectEntries(entries);
}

export async function loadRenderingDataForPage(
  doc: PDFDocument,
  pageIndex: number
) {
  const page: Page = await doc.getPage(pageIndex);
  page.loadResources(RESOURCES_KEYS_OPERATOR_LIST);

  // Directly call partialEvaluator.getOperatorList
  const partialEvaluator = page.createPartialEvaluator({
    // See vendor/pdfjs/display/api.js
    send: (handler, [id, type, data]) => {
      console.log(`Received exported data for id: ${id}, type: ${type}`, data);
      if (handler == "commonobj") {
        if ("error" in data) {
          const exportedError = data.error;
          console.warn(`Error during font loading: ${exportedError}`);
          PDF_COMMON_OBJECTS.resolve(id, exportedError);
          return;
        }
        if (type === "Font") {
          // @ts-expect-error need to do this for some reason
          data.disableFontFace = false;
          // @ts-expect-error need to do this for some reason
          data.fontExtraProperties = false;
          const font = new FontFaceObject(data);
          console.log("FontFaceObject created:", font);
          FONT_LOADER.bind(font).finally(() => {
            console.log(`Font loaded and resolved for id: ${id}`, font);
            PDF_COMMON_OBJECTS.resolve(id, font);
          });
        }
      }
    },
  });
  const contentStream = await page.getContentStream();
  const opList = new OperatorList();
  await partialEvaluator.getOperatorList({
    stream: contentStream,
    task: { ensureNotTerminated() {} },
    // resources: await page.getMergedResources(
    //   ((await page.getContentStream()) as unknown as Stream).dict,
    //   RESOURCES_KEYS_OPERATOR_LIST
    // ),
    resources: page.resources,
    operatorList: opList,
  });
  return opList;
}
