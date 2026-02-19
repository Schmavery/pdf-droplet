import {
  loadRenderingDataForPage,
  PDF_COMMON_OBJECTS,
  PDF_OBJS,
  type ObjectMap,
} from "@/lib/loadPDF";
import type { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { DOMCanvasFactory } from "@pdfjs/display/canvas_factory.js";
import type { Page, PDFDocument } from "@pdfjs/core/document";
import { CanvasGraphics } from "@pdfjs/display/canvas.js";
import { PageViewport } from "@pdfjs/display/display_utils";
import { type SuspenseResource } from "@/lib/utils";
import type { ModifiedStream } from "@/App";

function PdfViewForPage(props: {
  doc: PDFDocument;
  objects: ObjectMap;
  page: SuspenseResource<Page>;
  modifiedStream?: ModifiedStream | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderErrors, setRenderErrors] = useState<string[]>([]);
  const page = props.page.read();
  const viewport = useMemo(
    () =>
      new PageViewport({
        viewBox: page.view,
        userUnit: page.userUnit,
        scale: 2,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        dontFlip: false,
      }),
    [page]
  );

  useEffect(() => {
    const abort = new AbortController();
    const render = async () => {
      if (canvasRef.current == null) return;
      const errors: string[] = [];

      const origLog = console.log;
      const captureWarnings = () => {
        console.log = (...args: unknown[]) => {
          const msg = String(args[0]);
          if (msg.startsWith("Warning: ")) {
            errors.push(msg.slice(9));
          }
          origLog.apply(console, args);
        };
      };
      const restoreLog = () => {
        console.log = origLog;
      };

      let opList;
      try {
        captureWarnings();
        opList = await loadRenderingDataForPage(
          props.doc,
          page.pageIndex ?? 0,
          props.modifiedStream ?? undefined,
        );
      } catch (e) {
        errors.push(`${e instanceof Error ? e.message : String(e)}`);
      } finally {
        restoreLog();
      }

      if (abort.signal.aborted) return;

      const context = canvasRef.current.getContext("2d");
      if (opList) {
        try {
          captureWarnings();
          const gfx = new CanvasGraphics(
            context,
            PDF_COMMON_OBJECTS,
            PDF_OBJS,
            new DOMCanvasFactory({ ownerDocument: document }),
            null,
            { optionalContentConfig: {} },
            undefined,
            undefined,
            null
          );
          gfx.beginDrawing({
            transform: undefined,
            viewport,
            transparency: false,
            background: "#fff",
          });
          gfx.executeOperatorList(opList);
          gfx.endDrawing();
        } catch (e) {
          errors.push(`${e instanceof Error ? e.message : String(e)}`);
        } finally {
          restoreLog();
        }
      }

      if (!abort.signal.aborted) {
        setRenderErrors([...new Set(errors)]);
      }
    };
    render();
    return () => abort.abort();
  }, [props.doc, page, viewport, props.modifiedStream]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={viewport.width}
        height={viewport.height}
        className="border-2 border-gray-300 drop-shadow-2xl"
        style={{
          width: "200%",
          height: "auto",
          transform: "scale(0.5)",
          transformOrigin: "top left",
        }}
      />
      {renderErrors.length > 0 && (
        <div className="mt-2 space-y-1">
          {renderErrors.map((err, i) => (
            <div key={i} className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 font-mono">
              {err}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PdfView(props: {
  manager?: LocalPdfManager;
  page: SuspenseResource<Page>;
  objects: ObjectMap;
  modifiedStream?: ModifiedStream | null;
}) {
  const doc = props.manager?.pdfDocument;
  if (!doc) return <div>No document loaded</div>;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PdfViewForPage
        doc={doc}
        objects={props.objects}
        page={props.page}
        modifiedStream={props.modifiedStream}
      />
    </Suspense>
  );
}
