import type { BaseStream } from "@pdfjs/core/base_stream";
import { RESOURCES_KEYS_OPERATOR_LIST } from "@pdfjs/core/core_utils";
import type { Page, PDFDocument } from "@pdfjs/core/document";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { OperatorList } from "@pdfjs/core/operator_list";
import { CIRCULAR_REF, Dict, isRefsEqual, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";
import { FontFaceObject, FontLoader } from "@pdfjs/display/font_loader";
import { PDFObjects } from "@pdfjs/display/pdf_objects";

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
  val: PDFVal;
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
};

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
  console.log("found a page index for ", target);
  if (pageIndex != -1) {
    console.log("found page for dict");
    return (targetObject.pageIndex = pageIndex);
  }

  targetObject.backlinks?.forEach((backlink) => {
    populateAncestorPageIndex(backlink.ref, objects, pagesArray, visited);
  });

  const ancestorPageIndex = targetObject.backlinks
    ?.map((backlink) =>
      objects.find((obj) => isRefsEqual(obj.ref, backlink.ref))
    )
    .find((entry) => entry?.pageIndex !== undefined);

  targetObject.pageIndex = ancestorPageIndex?.pageIndex;
}

export function loadAllObjects(doc: PDFDocument): ObjectEntry[] {
  const entries = Object.entries(doc.xref.entries)
    .slice(1)
    .map(([key, value]) => {
      const ref = new Ref(parseInt(key), value.gen);
      const val = doc.xref.fetch(ref);
      if (val instanceof Stream || val instanceof FlateStream) {
        val.getBytes();
      }
      return { ref, val, backlinks: [] } as ObjectEntry;
    }) as ObjectEntry[];
  const backlinksIndex = Object.fromEntries(
    entries.map((entry) => [entry.ref.toString(), findRefs(entry.val)])
  );
  entries.forEach((entry) => {
    entry.backlinks = entries.flatMap((e) => {
      const links = backlinksIndex[e.ref.toString()];
      const match = links.find((link) => isRefsEqual(link.ref, entry.ref));
      return match ? { ref: e.ref, hint: match.hint, val: e.val } : [];
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
  return entries;
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
