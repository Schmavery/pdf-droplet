import type { ObjectEntry } from "@/App";
import type { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { useEffect, useRef } from "react";
import { DOMCanvasFactory } from "@pdfjs/display/canvas_factory.js";
import type { Page } from "@pdfjs/core/document";
import { PDFObjects } from "@pdfjs/display/pdf_objects.js";
import { OperatorList } from "@pdfjs/core/operator_list";
import { CanvasGraphics } from "@pdfjs/display/canvas.js";
import { RESOURCES_KEYS_OPERATOR_LIST } from "@pdfjs/core/core_utils";
import type { Stream } from "@pdfjs/core/stream";
import { FontFaceObject, FontLoader } from "@pdfjs/display/font_loader";
import { PageViewport } from "@pdfjs/display/display_utils";

const FONT_LOADER = new FontLoader({ ownerDocument: document });

export default function PdfView(props: {
  manager?: LocalPdfManager;
  objects: ObjectEntry[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const render = async () => {
      if (!props.manager) return;
      const pdfDoc = props.manager.pdfDocument;
      if (!pdfDoc) return;
      const page: Page = await pdfDoc.getPage(0);
      page.loadResources(RESOURCES_KEYS_OPERATOR_LIST);

      const viewport = new PageViewport({
        viewBox: page.view,
        userUnit: page.userUnit,
        scale: 1,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        dontFlip: false,
      });

      // Create canvas
      const canvasFactory = new DOMCanvasFactory({ ownerDocument: document });
      const { canvas, context } = canvasFactory.create(
        viewport.width,
        viewport.height
      );

      // Create local caches
      const objs = new PDFObjects();
      const commonObjs = new PDFObjects();

      console.log("Resources:", page.resources.get("Font"));
      console.log("All objects preloaded into PDFObjects:", objs);

      // Directly call partialEvaluator.getOperatorList
      const partialEvaluator = page.createPartialEvaluator({
        // See vendor/pdfjs/display/api.js
        send: (handler, [id, type, data]) => {
          console.log(
            `Received exported data for id: ${id}, type: ${type}`,
            data
          );
          if (handler == "commonobj") {
            if ("error" in data) {
              const exportedError = data.error;
              console.warn(`Error during font loading: ${exportedError}`);
              commonObjs.resolve(id, exportedError);
              return;
            }
            if (type === "Font") {
              data.disableFontFace = false;
              data.fontExtraProperties = false;
              const font = new FontFaceObject(data);
              console.log("FontFaceObject created:", font);
              FONT_LOADER.bind(font).finally(() => {
                console.log(`Font loaded and resolved for id: ${id}`, font);
                commonObjs.resolve(id, font);
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
        resources: await page.getMergedResources(
          ((await page.getContentStream()) as unknown as Stream).dict,
          RESOURCES_KEYS_OPERATOR_LIST
        ),
        operatorList: opList,
      });

      // Use CanvasGraphics to render
      const gfx = new CanvasGraphics(
        context,
        commonObjs,
        objs,
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
          ctx.clearRect(0, 0, viewport.width, viewport.height);
          ctx.drawImage(canvas, 0, 0);
        }
      }
    };
    render();
  }, [props.manager, props.objects]);

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">PDF View</h2>
      <canvas
        ref={canvasRef}
        width={600}
        height={800}
        style={{ width: "100%", height: "auto", border: "1px solid #ccc" }}
      />
    </div>
  );
}
