import PdfView from "@/components/app/PdfView";
import type { ObjectEntry, ObjectMap } from "@/lib/loadPDF";
import type { LocalPdfManager } from "@pdfjs/core/pdf_manager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs";
import { HexView } from "@/components/app/HexViewVirt";
import { Button } from "@/components/ui/button";

export function Viewer(props: {
  manager?: LocalPdfManager;
  objects: ObjectMap;
  currentObject?: ObjectEntry;
  clearCurrentUpload: () => void;
}) {
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
        {props.manager?.localStream && (
          <HexView
            data={props.manager.localStream.bytes}
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
