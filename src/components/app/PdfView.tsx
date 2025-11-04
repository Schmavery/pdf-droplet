import {
  loadRenderingDataForPage,
  PDF_COMMON_OBJECTS,
  PDF_OBJS,
  type ObjectMap,
} from "@/lib/loadPDF";
import type { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { DOMCanvasFactory } from "@pdfjs/display/canvas_factory.js";
import type { Page, PDFDocument } from "@pdfjs/core/document";
import { CanvasGraphics } from "@pdfjs/display/canvas.js";
import { PageViewport } from "@pdfjs/display/display_utils";
import { type SuspenseResource } from "@/lib/utils";

function PdfViewForPage(props: {
  doc: PDFDocument;
  objects: ObjectMap;
  page: SuspenseResource<Page>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      // Create canvas
      // const canvasFactory = new DOMCanvasFactory({ ownerDocument: document });
      // const { canvas, context } = canvasFactory.create(
      //   viewport.width * 2,
      //   viewport.height * 2
      // );

      const context = canvasRef.current.getContext("2d");

      const opList = await loadRenderingDataForPage(
        props.doc,
        page.pageIndex ?? 0
      );

      if (abort.signal.aborted) {
        return;
      }

      // Use CanvasGraphics to render
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

      // Copy to ref
      // if (canvasRef.current) {
      //   const ctx = canvasRef.current.getContext("2d");
      //   if (ctx) {
      //     ctx.clearRect(0, 0, viewport.width * 2, viewport.height * 2);
      //     ctx.drawImage(canvas, 0, 0);
      //   }
      // }
    };
    render();
    return () => abort.abort();
  }, [props.doc, page, viewport]);

  return (
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
  );
}

export default function PdfView(props: {
  manager?: LocalPdfManager;
  page: SuspenseResource<Page>;
  objects: ObjectMap;
}) {
  const doc = props.manager?.pdfDocument;
  if (!doc) return <div>No document loaded</div>;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PdfViewForPage doc={doc} objects={props.objects} page={props.page} />
    </Suspense>
  );
}
