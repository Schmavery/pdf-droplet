import PdfView from "@/components/app/PdfView";
import type { ObjectEntry, ObjectMap } from "@/lib/loadPDF";
import type { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs";
import { HexView } from "@/components/app/HexViewVirt";
import { Button } from "@/components/ui/button";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { useMemo } from "react";

export function Viewer(props: {
  manager?: LocalPdfManager;
  objects: ObjectMap;
  currentObject?: ObjectEntry;
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
        <div className="ml-auto">
          <Button size={"sm"} onClick={props.clearCurrentUpload}>
            Upload PDF
          </Button>
        </div>
      </div>
      <TabsContent value="pdf">
        <PdfView
          objects={props.objects}
          manager={props.manager}
          pageIndex={props.currentObject?.pageIndex}
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
