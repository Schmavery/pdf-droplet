import type { ObjectEntry } from "@/loadPDF";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getObjectSizeString, getObjectType } from "@/objectUtils";
import { Ref } from "@pdfjs/core/primitives";

function ListItem(props: {
  entry: ObjectEntry;
  onClick?: () => void;
  selected: boolean;
}) {
  return (
    <li>
      <button
        aria-selected={props.selected}
        onClick={props.onClick}
        className={
          "rounded border border-solid border-gray-200 p-2 hover:bg-gray-50 aria-selected:bg-blue-200 w-full flex justify-between"
        }
      >
        <span>
          {props.entry.ref.toString()} - {getObjectType(props.entry)}
        </span>
        <span>{getObjectSizeString(props.entry)}</span>
      </button>
    </li>
  );
}

export default function ObjectList(props: {
  objects: ObjectEntry[];
  selectedObject?: Ref;
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
              selected={
                props.selectedObject?.toString() === entry.ref.toString()
              }
              entry={entry}
              onClick={() => props.selectObject(entry.ref)}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
