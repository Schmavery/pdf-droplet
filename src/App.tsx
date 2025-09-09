import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { isRefsEqual, Ref } from "@pdfjs/core/primitives.js";
import ObjectList from "@/ObjectList";
import ObjectDetail from "@/ObjectDetail";
import PdfView from "@/PdfView";
import {
  loadAllObjects,
  loadRenderingDataForPage,
  type ObjectEntry,
} from "@/loadPDF";
import { nanoid } from "nanoid";
import type { OperatorList } from "@pdfjs/core/operator_list";

type PageEntry = {
  pageIndex: number;
  operatorList: OperatorList;
};

function App() {
  const [breadcrumb, setBreadcrumb] = useState<Ref[]>([]);
  const [pdfState, setPdfState] = useState<{
    manager?: LocalPdfManager;
    pages: PageEntry[];
    objects: ObjectEntry[];
  }>({
    manager: undefined,
    pages: [],
    objects: [],
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/sample-local-pdf.pdf", { signal: controller.signal })
      .then((response) => response.arrayBuffer())
      .then(async (buffer) => {
        if (controller.signal.aborted) return;
        const uint8Array = new Uint8Array(buffer);
        const manager = new LocalPdfManager({
          source: uint8Array,
          evaluatorOptions: { isOffscreenCanvasSupported: true },
          docId: nanoid(10),
        });
        manager.pdfDocument.checkHeader();
        manager.pdfDocument.parseStartXRef();
        manager.pdfDocument.parse();
        const entries = loadAllObjects(manager.pdfDocument);
        const pageInfos = Promise.all(
          Array.from({ length: manager.pdfDocument.numPages }, (_, i) => i).map(
            async (pageIndex) => {
              return {
                pageIndex,
                operatorList: await loadRenderingDataForPage(
                  manager.pdfDocument,
                  pageIndex
                ),
              };
            }
          )
        );
        setPdfState({ manager, pages: await pageInfos, objects: entries });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Error loading PDF:", error);
      });
    return () => {
      controller.abort("unmount");
    };
  }, []);

  const currentObject = breadcrumb.length
    ? pdfState.objects.find((e) =>
        isRefsEqual(e.ref, breadcrumb[breadcrumb.length - 1])
      )
    : undefined;

  return (
    <div className="h-screen w-full bg-gray-100">
      <ResizablePanelGroup direction="horizontal" className="gap-0.5 margin-1">
        <ResizablePanel>
          <ResizablePanelGroup direction="vertical" className="gap-0.5">
            <ResizablePanel className="shadow border border-solid border-gray-200 rounded bg-white mt-2 ml-2">
              <ObjectList
                objects={pdfState.objects}
                selectedObject={currentObject?.ref}
                selectObject={(r) => setBreadcrumb([r])}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className="shadow border border-solid border-gray-200 rounded bg-white mb-2 ml-2">
              <ObjectDetail
                key={currentObject ? currentObject.ref.toString() : "no-object"}
                breadcrumb={breadcrumb}
                onBreadcrumbNavigate={(i) => {
                  const newBreadcrumb = breadcrumb.slice(0, i + 1);
                  setBreadcrumb(newBreadcrumb);
                }}
                onRefClick={(ref) => {
                  const entry = pdfState.objects.find((obj) =>
                    isRefsEqual(obj.ref, ref)
                  );
                  if (entry) {
                    setBreadcrumb([...breadcrumb, entry.ref]);
                  }
                }}
                object={currentObject}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="shadow border border-solid border-gray-200 rounded bg-white m-2 ml-0">
          <PdfView
            objects={pdfState.objects}
            manager={pdfState.manager}
            pageIndex={currentObject?.pageIndex}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
