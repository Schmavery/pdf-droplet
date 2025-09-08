import type { ObjectEntry, PDFVal } from "@/App";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";

function getObjectType(val: PDFVal): string {
  console.log("Determining type for value:", val);
  switch (true) {
    case val === null:
      return "null";
    case typeof val === "number":
      return "number";
    case typeof val === "string":
      return "string";
    case val instanceof Array:
      return "array";
    case val instanceof Ref:
      return "ref";
    case val instanceof Dict:
      return "dict";
    case val instanceof Stream:
      return "stream";
    case val instanceof FlateStream:
      return "stream C";
    default:
      return "unknown";
  }
}

function ListItem(props: { entry: ObjectEntry; onClick?: () => void }) {
  console.log("Rendering ListItem for entry:", props.entry);
  return (
    <li>
      <button
        onClick={props.onClick}
        className="rounded border border-solid border-gray-200 p-2 hover:bg-gray-50 w-full text-left"
      >
        {props.entry.ref.toString()} - {getObjectType(props.entry.val)}
      </button>
    </li>
  );
}

export default function ObjectList(props: {
  objects: ObjectEntry[];
  selectObject: (entry: Ref) => void;
}) {
  if (props.objects.length === 0) {
    return (
      <div className="p-3">
        <p>No objects available.</p>
      </div>
    );
  }

  return (
    <div className="p-1 h-full w-full">
      <ScrollArea className="h-full w-full">
        <ul className="space-y-1 ">
          {props.objects.map((entry) => (
            <ListItem
              key={entry.ref.toString()}
              entry={entry}
              onClick={() => props.selectObject(entry.ref)}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
