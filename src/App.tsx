import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { Ref } from "@pdfjs/core/primitives.js";
import ObjectList from "@/components/app/ObjectList";
import ObjectDetail from "@/components/app/ObjectDetail";
import {
  loadAllObjects,
  loadRenderingDataForPage,
  type ObjectMap,
} from "@/lib/loadPDF";
import { nanoid } from "nanoid";
import { OperatorList } from "@pdfjs/core/operator_list";
import { DEFAULT_SORT, makeSortComparator } from "@/lib/objectUtils";
import DropZone from "@/components/app/DropZone";

import favicon from "@assets/favicon.svg";
import { Viewer } from "@/components/app/Viewer";

const TEST_FILES: [string, string][] = Object.entries(
  import.meta.glob("@assets/test/*.pdf", {
    eager: true,
    import: "default",
  })
);

type PageEntry = {
  pageIndex: number;
  operatorList: OperatorList;
};

function App() {
  const [breadcrumb, setBreadcrumb] = useState<Ref[]>([]);
  const [file, setFile] = useState<ArrayBuffer>();
  const [pdfState, setPdfState] = useState<
    | {
        manager?: LocalPdfManager;
        pages: PageEntry[];
        objects: ObjectMap;
      }
    | "loading"
  >();
  // Load demo
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDemo = params.has("demo");
    if (!isDemo) return;
    const urlFile = params.get("file") ?? "sample-local-pdf.pdf";
    const demoFile =
      urlFile && TEST_FILES.find(([k]) => k.includes(urlFile))?.[1];
    if (!demoFile) {
      console.log(TEST_FILES);
      console.warn("Demo file not found:", urlFile);
      return;
    }
    const controller = new AbortController();
    fetch(demoFile, { signal: controller.signal })
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        if (controller.signal.aborted) return;
        setFile(buffer);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Error loading file:", error);
      });
    return () => {
      controller.abort("unmount");
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function go() {
      if (!file) return;
      if (controller.signal.aborted) return;
      const uint8Array = new Uint8Array(file);
      const manager = new LocalPdfManager({
        source: uint8Array,
        evaluatorOptions: { isOffscreenCanvasSupported: true },
        docId: nanoid(10),
      });
      manager.pdfDocument.checkHeader();
      manager.pdfDocument.parseStartXRef();
      manager.pdfDocument.parse();
      const entries = loadAllObjects(manager.pdfDocument, manager.localStream);
      const pageInfos = Promise.all(
        Array.from({ length: manager.pdfDocument.numPages }, (_, i) => i).map(
          async (pageIndex) => {
            return {
              pageIndex,
              // operatorList: await loadRenderingDataForPage(
              //   manager.pdfDocument,
              //   pageIndex
              // ),
              operatorList: new OperatorList(),
            };
          }
        )
      );
      setPdfState({ manager, pages: await pageInfos, objects: entries });

      const objects = [...entries.values()];
      objects.sort(makeSortComparator(DEFAULT_SORT));
      const first = objects[0]?.ref;
      setBreadcrumb(first ? [first] : []);
    }
    go();
    return () => {
      controller.abort("unmount");
    };
  }, [file]);

  if (!pdfState) {
    return (
      <div className="h-screen w-full bg-gray-100">
        <div className="flex flex-col p-3 min-h-screen h-screen max-w-3xl mx-auto">
          <h1 className="text-2xl font-extrabold tracking-tight mb-6 mt-4 flex items-center gap-3">
            <img src={favicon} className="h-8" /> PDF Droplet
          </h1>
          <DropZone setFile={async (f) => setFile(await f.arrayBuffer())} />
          <div className="flex gap-1 mt-auto">
            Inspired by
            <a
              href="https://fontdrop.info/"
              target="_blank"
              className="text-blue-600"
            >
              FontDrop!
            </a>{" "}
            ❤️
          </div>
        </div>
      </div>
    );
  }

  if (pdfState === "loading") {
    return "loading";
  }

  const currentObject = breadcrumb.length
    ? pdfState.objects.get(breadcrumb[breadcrumb.length - 1])
    : undefined;
  console.log("Current object:", currentObject);

  return (
    <div className="h-screen w-full bg-gray-100">
      <ResizablePanelGroup direction="horizontal" className="gap-0.5 margin-1">
        <ResizablePanel>
          <ResizablePanelGroup direction="vertical" className="gap-0.5">
            <ResizablePanel
              defaultSize={33}
              className="shadow border border-solid border-gray-200 rounded bg-white mt-2 ml-2"
            >
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
                  const entry = pdfState.objects.get(ref);
                  console.log("Clicked ref:", ref, pdfState.objects, entry);
                  if (entry) {
                    setBreadcrumb([...breadcrumb, entry.ref]);
                  }
                }}
                object={currentObject}
                objects={pdfState.objects}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="shadow border border-solid border-gray-200 rounded bg-white m-2 ml-0">
          <Viewer
            objects={pdfState.objects}
            manager={pdfState.manager}
            currentObject={currentObject}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
