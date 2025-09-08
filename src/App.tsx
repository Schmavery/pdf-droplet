import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

// import {PDFDocument} from "@pdfjs/core/document";
import { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import type { CIRCULAR_REF } from "@pdfjs/core/primitives.js";
import { isRefsEqual, Ref, Dict } from "@pdfjs/core/primitives.js";
import ObjectList from "@/ObjectList";
import ObjectDetail from "@/ObjectDetail";
import PdfView from "@/PdfView";
import { BaseStream } from "@pdfjs/core/base_stream";

export type PDFVal =
  | Dict
  | BaseStream
  | null
  | number
  | string
  | typeof CIRCULAR_REF;

export type ObjectEntry = {
  ref: Ref;
  val: PDFVal;
};

function App() {
  const [manager, setManager] = useState<LocalPdfManager | undefined>();
  const [objects, setObjects] = useState<ObjectEntry[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<Ref[]>([]);

  useEffect(() => {
    fetch("/sample-local-pdf.pdf")
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const uint8Array = new Uint8Array(buffer);
        const manager = new LocalPdfManager({
          source: uint8Array,
          evaluatorOptions: { isOffscreenCanvasSupported: true },
        });
        manager.pdfDocument.checkHeader();
        manager.pdfDocument.parseStartXRef();
        manager.pdfDocument.parse();
        setManager(manager);
      });
  }, []);

  useEffect(() => {
    if (manager) {
      console.log("PDF Manager initialized:", manager);
      const entries = Object.entries(manager.pdfDocument.xref.entries)
        .slice(1)
        .map(([key, value]) => {
          const ref = new Ref(parseInt(key), value.gen);
          const val = manager.pdfDocument.xref.fetch(ref);
          return { ref, val };
        }) as ObjectEntry[];
      setObjects(entries);
    }
  }, [manager]);

  return (
    <div className="h-screen w-full bg-gray-100">
      <ResizablePanelGroup direction="horizontal" className="gap-0.5 margin-1">
        <ResizablePanel>
          <ResizablePanelGroup direction="vertical" className="gap-0.5">
            <ResizablePanel className="shadow border border-solid border-gray-200 rounded bg-white mt-2 ml-2">
              <ObjectList
                objects={objects}
                selectObject={(r) => setBreadcrumb([r])}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className="shadow border border-solid border-gray-200 rounded bg-white mb-2 ml-2">
              <ObjectDetail
                breadcrumb={breadcrumb}
                onBreadcrumbNavigate={(i) => {
                  const newBreadcrumb = breadcrumb.slice(0, i + 1);
                  setBreadcrumb(newBreadcrumb);
                }}
                onRefClick={(ref) => {
                  const entry = objects.find((obj) =>
                    isRefsEqual(obj.ref, ref)
                  );
                  if (entry) {
                    setBreadcrumb([...breadcrumb, entry.ref]);
                  }
                }}
                object={
                  breadcrumb.length
                    ? objects.find((e) =>
                        isRefsEqual(e.ref, breadcrumb[breadcrumb.length - 1])
                      )
                    : undefined
                }
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="shadow border border-solid border-gray-200 rounded bg-white m-2 ml-0">
          <PdfView />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
