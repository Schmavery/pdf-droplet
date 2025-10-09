import {
  loadRenderingDataForPage,
  PDF_COMMON_OBJECTS,
  PDF_OBJS,
  type ObjectMap,
} from "@/lib/loadPDF";
import type { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { useEffect, useRef } from "react";
import { DOMCanvasFactory } from "@pdfjs/display/canvas_factory.js";
import type { Page } from "@pdfjs/core/document";
import { PDFObjects } from "@pdfjs/display/pdf_objects.js";
import { CanvasGraphics } from "@pdfjs/display/canvas.js";
import { PageViewport } from "@pdfjs/display/display_utils";

export default function PdfView(props: {
  manager?: LocalPdfManager;
  objects: ObjectMap;
  pageIndex?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    const render = async () => {
      if (!props.manager) return;
      const pdfDoc = props.manager.pdfDocument;
      if (!pdfDoc) return;
      const page: Page = await pdfDoc.getPage(props.pageIndex ?? 0);
      if (abort.signal.aborted) {
        return;
      }

      const viewport = new PageViewport({
        viewBox: page.view,
        userUnit: page.userUnit,
        scale: 2,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        dontFlip: false,
      });

      // Create canvas
      const canvasFactory = new DOMCanvasFactory({ ownerDocument: document });
      const { canvas, context } = canvasFactory.create(
        viewport.width * 2,
        viewport.height * 2
      );

      // Create local caches
      // const objs = new PDFObjects();
      // const commonObjs = new PDFObjects();

      console.log("Resources:", page.resources.get("Font"));

      const opList = await loadRenderingDataForPage(
        pdfDoc,
        props.pageIndex ?? 0
      );

      if (abort.signal.aborted) {
        return;
      }

      // console.log("Operator List:", opList);
      console.log("Common Objects:", PDF_COMMON_OBJECTS);
      console.log("PDF Objs:", PDF_OBJS);

      // Use CanvasGraphics to render
      const gfx = new CanvasGraphics(
        context,
        PDF_COMMON_OBJECTS,
        PDF_OBJS,
        canvasFactory,
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
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, viewport.width * 2, viewport.height * 2);
          ctx.drawImage(canvas, 0, 0);
        }
      }
    };
    render();
    return () => abort.abort();
  }, [props.manager, props.objects, props.pageIndex]);

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={1600}
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
