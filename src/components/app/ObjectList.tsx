import type { ObjectEntry, ObjectMap } from "@/lib/loadPDF";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  applyFilters,
  DEFAULT_SORT,
  FILTER_OPTIONS,
  getObjectSizeString,
  getObjectType,
  makeSortComparator,
  type SortValue,
} from "@/lib/objectUtils";
import { Ref } from "@pdfjs/core/primitives";
import { Button } from "@/components/ui/button";
import { Ghost, ListFilter } from "lucide-react";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuSortItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuPortal,
} from "@radix-ui/react-dropdown-menu";
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
          <span className="flex-shrink-0 whitespace-nowrap">
            {props.entry.ref.toString()} -&nbsp;
          </span>
          <span>{getObjectType(props.entry)}</span>
        </div>
        {props.entry.fromObjStm && (
          <div className="flex-shrink-0 ml-auto">
            <Ghost
              className="inline"
              size={"20"}
              color="gray"
              aria-label="Included in Object stream"
            />
          </div>
        )}
        {!props.entry.fromObjStm && (
          <div className="flex-shrink-0 whitespace-nowrap ml-auto">
            {getObjectSizeString(props.entry)}
          </div>
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

function SortFilterDropdown(props: {
  sort: SortValue;
  setSort: (v: SortValue) => void;
  filters: Set<string>;
  setFilters: (v: Set<string>) => void;
}) {
  const toggleFilter = (id: string) => {
    const next = new Set(props.filters);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    props.setFilters(next);
  };

  return (
    <DropdownMenu modal>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilter size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent side="bottom" align="end" sideOffset={-32} className="z-50 shadow border border-solid border-gray-200 rounded bg-white min-w-[160px]">
          <DropdownMenuLabel className="text-xs text-gray-500">
            Sort by
          </DropdownMenuLabel>
          <SortDropdownItem
            row="OBJ"
            sortValue={props.sort}
            setSortValue={props.setSort}
          >
            Object ID
          </SortDropdownItem>
          <SortDropdownItem
            row="PAGE"
            sortValue={props.sort}
            setSortValue={props.setSort}
          >
            Page Num
          </SortDropdownItem>
          <SortDropdownItem
            row="SIZE"
            sortValue={props.sort}
            setSortValue={props.setSort}
          >
            Size
          </SortDropdownItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-gray-500 flex items-center justify-between">
            Include
            <span className="flex gap-1 font-normal">
              <button
                className="hover:text-gray-900 cursor-pointer"
                onPointerDown={(e) => {
                  e.preventDefault();
                  props.setFilters(new Set(FILTER_OPTIONS.map((f) => f.id)));
                }}
              >
                All
              </button>
              <span className="text-gray-300">|</span>
              <button
                className="hover:text-gray-900 cursor-pointer"
                onPointerDown={(e) => {
                  e.preventDefault();
                  props.setFilters(new Set());
                }}
              >
                None
              </button>
            </span>
          </DropdownMenuLabel>
          {FILTER_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.id}
              checked={props.filters.has(option.id)}
              onSelect={(e) => {
                e.preventDefault();
                toggleFilter(option.id);
              }}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
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
  const [filters, setFilters] = useState<Set<string>>(
    () => new Set(FILTER_OPTIONS.map((f) => f.id)),
  );
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

  const allObjects = [...props.objects.values()];
  const objects = applyFilters(allObjects, filters, props.selectedObject);
  objects.sort(makeSortComparator(sort));

  const isFiltered = filters.size < FILTER_OPTIONS.length;
  const countLabel = isFiltered
    ? `${objects.length} / ${props.objects.size}`
    : `${props.objects.size}`;

  return (
    <div className=" h-full w-full flex flex-col">
      <div className="shadow-[0_4px_2px_-2px] shadow-gray-200 py-1 px-2 flex justify-between items-center">
        <div>Objects ({countLabel})</div>
        <div>
          <SortFilterDropdown
            sort={sort}
            setSort={setSort}
            filters={filters}
            setFilters={setFilters}
          />
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
