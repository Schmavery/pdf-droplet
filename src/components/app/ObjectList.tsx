import type { ObjectEntry, ObjectMap } from "@/lib/loadPDF";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFAULT_SORT,
  getObjectSizeString,
  getObjectType,
  makeSortComparator,
  type SortValue,
} from "@/lib/objectUtils";
import { Ref } from "@pdfjs/core/primitives";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuPortal,
} from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Ghost } from "lucide-react";
import { DropdownMenuSortItem } from "@/components/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";

function ListItem(props: {
  entry: ObjectEntry;
  onClick?: () => void;
  selected: boolean;
  selectedRef?: React.RefObject<HTMLLIElement | null>;
}) {
  return (
    <li ref={props.selectedRef}>
      <button
        aria-selected={props.selected}
        onClick={props.onClick}
        className={
          "rounded border border-solid border-gray-200 p-2 hover:bg-gray-50 aria-selected:bg-blue-200 w-full flex items-start gap-2 text-left"
        }
      >
        <div className="min-w-0 flex">
          <span className="flex-shrink-0 whitespace-nowrap">{props.entry.ref.toString()} -&nbsp;</span>
          <span>{getObjectType(props.entry)}</span>
        </div>
        {props.entry.fromObjStm && (
          <div className="flex-shrink-0 ml-auto">
            <Ghost className="inline" size={"20"} color="gray" />
          </div>
        )}
        {!props.entry.fromObjStm && (
          <div className="flex-shrink-0 whitespace-nowrap ml-auto">{getObjectSizeString(props.entry)}</div>
        )}
      </button>
    </li>
  );
}

function SortDropdownItem(props: {
  row: SortValue["row"];
  sortValue: SortValue;
  setSortValue: (v: SortValue) => void;
  children: string;
}) {
  return (
    <DropdownMenuSortItem
      sort={props.sortValue.row === props.row ? props.sortValue.dir : undefined}
      onSelect={() => {
        const currentValue =
          props.sortValue.row == props.row ? props.sortValue.dir : undefined;
        const newValue = currentValue == "ASC" ? "DESC" : "ASC";
        props.setSortValue({ row: props.row, dir: newValue });
      }}
      children={props.children}
    />
  );
}

function SortDropdown(props: {
  value: SortValue;
  setValue: (v: SortValue) => void;
}) {
  return (
    <DropdownMenu modal>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ChevronsUpDown />{" "}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent className="shadow border border-solid border-gray-200 rounded bg-white">
          <SortDropdownItem
            row="OBJ"
            sortValue={props.value}
            setSortValue={props.setValue}
          >
            Object ID
          </SortDropdownItem>
          <SortDropdownItem
            row="PAGE"
            sortValue={props.value}
            setSortValue={props.setValue}
          >
            Page Num
          </SortDropdownItem>
          <SortDropdownItem
            row="SIZE"
            sortValue={props.value}
            setSortValue={props.setValue}
          >
            Size
          </SortDropdownItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}

export default function ObjectList(props: {
  objects: ObjectMap;
  selectedObject?: Ref;
  selectObject: (entry: Ref) => void;
}) {
  const [sort, setSort] = useState<SortValue>(DEFAULT_SORT);
  const selectedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [props.selectedObject]);

  if (props.objects.size === 0) {
    return (
      <div className="p-3">
        <p>No objects available.</p>
      </div>
    );
  }

  const objects = [...props.objects.values()];
  objects.sort(makeSortComparator(sort));

  return (
    <div className=" h-full w-full flex flex-col">
      <div className="shadow-[0_4px_2px_-2px] shadow-gray-200 py-1 px-2 flex justify-between">
        <div>Objects ({props.objects.size})</div>
        <div>
          <SortDropdown value={sort} setValue={setSort} />
        </div>
      </div>
      <ScrollArea className="w-full flex-1 min-h-0 p-1 mb-1">
        <ul className="space-y-1">
          {objects.map((entry) => (
            <ListItem
              key={entry.ref.toString()}
              selectedRef={
                props.selectedObject?.toString() === entry.ref.toString()
                  ? selectedRef
                  : undefined
              }
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
