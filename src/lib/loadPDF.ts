import { BaseStream } from "@pdfjs/core/base_stream";
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
export const PDF_OBJS = new PDFObjects();

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
  fromObjStm?: Ref;
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
      const refNum = parseInt(key);
      const xrefEntry = doc.xref.getEntry(refNum);
      // TODO is this OK??
      // PDFjs uses incremental generations on entries that are compressed
      const ref = new Ref(refNum, xrefEntry?.uncompressed ? value.gen : 0);
      const val = doc.xref.fetch(ref);
      if (val instanceof Stream || val instanceof FlateStream) {
        val.getBytes();
      }

      const start = value.offset;
      let end = start;
      if (xrefEntry && !xrefEntry.uncompressed) {
        end = start + 10;
      } else {
        end = findEndOfObjPos(bufferStr, start);
      }
      return {
        ref,
        val,
        backlinks: [],
        fromObjStm:
          xrefEntry && !xrefEntry.uncompressed
            ? Ref.get(xrefEntry.offset, 0)
            : undefined,
        streamRange: {
          start: value.offset,
          end: end,
        },
      } as ObjectEntry;
    }) as ObjectEntry[];

  // Fix ranges for objects embedded in ObjStms
  const objStmIndex = new Map<
    number,
    {
      first: number;
      entries: { num: number; offset: number; endPos: number }[];
    }
  >();

  entries.forEach((entry) => {
    if (entry.fromObjStm && !objStmIndex.has(entry.fromObjStm.num)) {
      // const objstm = doc.xref.fetch(entry.fromObjStm);
      const objstm = entries.find((e) =>
        isRefsEqual(e.ref, entry.fromObjStm!)
      )?.val;
      if (objstm instanceof FlateStream && objstm.dict instanceof Dict) {
        const dict = objstm.dict;
        const bytes = objstm.buffer.slice(0, objstm.bufferLength);
        const first = dict.get("First");
        const entriesByteStr = bytesToString(bytes.slice(0, first));
        // Read pairs of [object number, offset] from bytesStr
        const parts = entriesByteStr.trim().split(/\s+/);
        const entries: { num: number; offset: number }[] = [];
        for (let i = 0; i < parts.length; i += 2) {
          const num = parseInt(parts[i]);
          const offset = parseInt(parts[i + 1]);
          entries.push({ num, offset });
        }
        const entriesWithEnd = entries.map((e, i) => ({
          ...e,
          endPos:
            i < entries.length - 1
              ? entries[i + 1].offset
              : bytes.length - first,
        }));

        objStmIndex.set(entry.fromObjStm.num, {
          first,
          entries: entriesWithEnd,
        });
      }
    }
  });

  entries.forEach((entry) => {
    if (entry.fromObjStm) {
      const objstmInfo = objStmIndex.get(entry.fromObjStm.num);
      if (objstmInfo) {
        const objEntry = objstmInfo.entries.find(
          (e) => e.num === entry.ref.num
        );
        if (!objEntry) {
          console.warn(
            "Couldn't find obj entry in objstm for",
            entry.ref,
            entry.fromObjStm
          );
        }
        entry.streamRange.start = objstmInfo.first + (objEntry?.offset ?? 0);
        entry.streamRange.end = objstmInfo.first + (objEntry?.endPos ?? 0);
      }
    }
  });

  // Set up backlinks
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

  // Find and name the Info dictionary if present
  const infoRef = doc.xref.trailer?.getRaw("Info") as Ref | undefined;
  if (infoRef) {
    entries.forEach((e) => {
      if (isRefsEqual(e.ref, infoRef)) {
        e.nameHint = "Info";
      }
    });
  }

  // Populate pageIndex for all objects that are or are contained in a page
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
    send: (handler, ...args) => {
      console.log(`Received exported data for send("${handler}")'`, args);
      if (handler == "commonobj") {
        const [id, type, data] = args[0] as [string, string, object];
        if ("error" in data) {
          const exportedError = data.error;
          console.warn(`Error during font loading: ${exportedError}`);
          PDF_COMMON_OBJECTS.resolve(id, exportedError);
          return;
        }
        switch (type) {
          case "Font": {
            // @ts-expect-error need to do this for some reason
            data.disableFontFace = false;
            // @ts-expect-error need to do this for some reason
            data.fontExtraProperties = false;
            const font = new FontFaceObject(data);
            FONT_LOADER.bind(font).finally(() => {
              PDF_COMMON_OBJECTS.resolve(id, font);
            });
            break;
          }
          case "FontPath":
          case "Image":
          case "Pattern":
            PDF_COMMON_OBJECTS.resolve(id, data);
            break;
          default:
            throw new Error(`Got unknown common object type ${type}`);
        }
      } else if (handler == "obj") {
        const [id, , type, data] = args[0] as [string, number, string, object];
        if (PDF_OBJS.has(id)) return;
        switch (type) {
          case "Image":
          case "Pattern":
            PDF_OBJS.resolve(id, data);
            break;
          default:
            throw new Error(`Got unknown object type ${type}`);
        }
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendWithPromise: (handler: string, [id, type, data]: any) => {
      if (handler === "commonobj") {
        if (type === "CopyLocalImage") {
          console.log("CopyLocalImage called:", id, type, data);
          return null;
          // for (const page of doc.#pageCache.values()) {
          //   // for (const pageProxy of this.#pageCache.values()) {
          //   for (const [, data] of pageProxy.objs) {
          //     if (data?.ref !== imageRef) {
          //       continue;
          //     }
          //     if (!data.dataLen) {
          //       return null;
          //     }
          //     PDF_COMMON_OBJECTS.resolve(id, structuredClone(data));
          //     return data.dataLen;
          //   }
          // }
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
