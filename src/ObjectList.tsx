import type { ObjectEntry } from "@/App";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getObjectType } from "@/object-utils";
import { Ref } from "@pdfjs/core/primitives";

function ListItem(props: { entry: ObjectEntry; onClick?: () => void }) {
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
