import PdfView from "@/components/app/PdfView";
import type { ObjectEntry, ObjectMap } from "@/lib/loadPDF";
import type { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs";
import { HexView } from "@/components/app/HexViewVirt";
import { Button } from "@/components/ui/button";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { useMemo } from "react";
import type { SuspenseResource } from "@/lib/utils";
import type { Page } from "@pdfjs/core/document";
import type { ModifiedStream } from "@/App";
import github from "@/assets/github.svg";

export function Viewer(props: {
  manager?: LocalPdfManager;
  objects: ObjectMap;
  currentObject?: ObjectEntry;
  page: SuspenseResource<Page>;
  modifiedStream?: ModifiedStream | null;
  clearCurrentUpload: () => void;
}) {
  const bytes = useMemo(() => {
    if (props.currentObject?.fromObjStm) {
      const objstm = props.objects.get(props.currentObject.fromObjStm);
      if (objstm && objstm.val instanceof FlateStream) {
        return objstm.val.buffer.slice(0, objstm.val.bufferLength);
      }
    }
    return props.manager?.localStream?.bytes;
  }, [
    props.currentObject?.fromObjStm,
    props.manager?.localStream?.bytes,
    props.objects,
  ]);

  return (
    <Tabs defaultValue="pdf" className="p-4 h-full">
      <div className="flex items-center">
        <TabsList className="flex gap-2 w-fit">
          <TabsTrigger value="pdf">PDF</TabsTrigger>
          <TabsTrigger value="hex">Bytes</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex gap-2 items-center">
          <Button size={"sm"} onClick={props.clearCurrentUpload}>
            Upload PDF
          </Button>
          <a
            href="https://github.com/schmavery/pdf-droplet"
            target="_blank"
          >
            <img src={github} alt="GitHub" className="w-6 h-6" />
          </a>
        </div>
      </div>
      <TabsContent value="pdf">
        <PdfView
          objects={props.objects}
          manager={props.manager}
          page={props.page}
          modifiedStream={props.modifiedStream}
        />
      </TabsContent>
      <TabsContent value="hex">
        {bytes && (
          <HexView
            data={bytes}
            highlights={
              props.currentObject
                ? [
                    {
                      start: props.currentObject.streamRange.start,
                      end: props.currentObject.streamRange.end,
                      type: "obj",
                      label: "Selected Object",
                    },
                  ]
                : []
            }
          />
        )}
        {!props.manager?.localStream && (
          <div className="p-4 text-muted-foreground">No data</div>
        )}
      </TabsContent>
    </Tabs>
  );
}
