import React, { useCallback, useContext, useState } from "react";
import { type ObjectEntry, type ObjectMap, type PDFVal } from "@/lib/loadPDF";
import { BaseStream } from "@pdfjs/core/base_stream";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Name, Ref } from "@pdfjs/core/primitives";
import Type3FontView from "@/components/app/detail/Type3FontView";
import ObjectBacklinks from "./ObjectBacklinks";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ObjectBreadcrumb } from "@/components/app/ObjectBreadcrumb";
import { Stream } from "@pdfjs/core/stream";
import ObjectStmRefs from "@/components/app/ObjectStmRefs";
import ContentStreamView from "@/components/app/detail/ContentStreamView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Page } from "@pdfjs/core/document";
import type { SuspenseResource } from "@/lib/utils";
import type { ModifiedStream } from "@/App";

function isBinaryString(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return true;
  }
  return false;
}

function stringToHex(s: string): string {
  return Array.from(s, (c) =>
    c.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
}

const ClearHighlightContext = React.createContext<() => void>(() => {});

const Caret = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 12 12"
    className={`w-3 h-3 shrink-0 transition-transform duration-200 select-none ${open ? "rotate-0" : "-rotate-90"}`}
    aria-hidden="true"
  >
    <polyline
      points="3,5 6,8 9,5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function DictEntryRow({
  keyLabel,
  val,
  depth,
  isNested,
  onRefClick,
  expandPath,
}: {
  keyLabel: string;
  val: PDFVal;
  depth: number;
  isNested: boolean;
  dict?: Dict;
  onRefClick?: (ref: Ref) => void;
  expandPath?: string[];
}) {
  const shouldAutoExpand = expandPath?.[0] === keyLabel;
  const isHighlighted =
    shouldAutoExpand && (expandPath?.length === 1 || !isNested);
  const [open, setOpen] = React.useState(shouldAutoExpand ?? false);
  const clearHighlight = useContext(ClearHighlightContext);

  let summary = null;
  if (!open && isNested) {
    if (val instanceof Dict) {
      summary =
        val._map.size === 0 ? "Dict{0} (empty)" : `Dict{${val._map.size}}`;
    } else if (Array.isArray(val)) {
      summary = val.length === 0 ? "Array[0] (empty)" : `Array[${val.length}]`;
    } else if (val instanceof FlateStream) {
      const dictSize = val.dict?._map.size ?? "";
      summary = dictSize === 0 ? "Stream{0} (empty)" : `Stream{${dictSize}}`;
    }
  }

  if (isNested) {
    return (
      <tr
        className={`border-b border-gray-100 last:border-b-0 ${isHighlighted ? "bg-blue-100" : ""}`}
      >
        <td colSpan={2} className="py-0.5 align-top">
          <Collapsible
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (expandPath?.length !== 0) clearHighlight();
            }}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-mono text-sm cursor-pointer select-text hover:text-blue-600 transition-colors"
              >
                <Caret open={open} />
                <span className="text-muted-foreground font-semibold">
                  {keyLabel}
                </span>
                {summary && (
                  <span className="text-muted-foreground/60 text-xs ml-1">
                    {summary}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-4">
                {renderValue(
                  val,
                  depth,
                  onRefClick,
                  shouldAutoExpand ? expandPath?.slice(1) : undefined,
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={`border-b border-gray-100 last:border-b-0 ${isHighlighted ? "bg-blue-100" : ""}`}
    >
      <td className="py-1 pr-3 text-muted-foreground font-semibold font-mono text-sm whitespace-nowrap align-top select-text">
        {keyLabel}
      </td>
      <td className="py-1 font-mono text-sm break-all select-text min-w-30">
        {renderValue(val, depth, onRefClick)}
      </td>
    </tr>
  );
}

function renderValue(
  val: PDFVal,
  depth: number,
  onRefClick?: (ref: Ref) => void,
  expandPath?: string[],
) {
  if (val instanceof Dict) {
    return (
      <DictEntries
        dict={val}
        depth={depth + 1}
        onRefClick={onRefClick}
        expandPath={expandPath}
      />
    );
  }
  if (Array.isArray(val)) {
    return (
      <DictEntries
        array={val}
        depth={depth + 1}
        onRefClick={onRefClick}
        expandPath={expandPath}
      />
    );
  }
  if (val instanceof Ref) {
    return (
      <button
        type="button"
        className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-500 transition-colors font-mono text-sm cursor-pointer"
        aria-label={`Select object ${val.toString()}`}
        onClick={() => onRefClick?.(val)}
      >
        {val.toString()}
      </button>
    );
  }
  if (val instanceof FlateStream) {
    return (
      <DictEntries
        dict={val.dict}
        depth={depth + 1}
        onRefClick={onRefClick}
        expandPath={expandPath}
      />
    );
  }
  if (typeof val === "string" && isBinaryString(val)) {
    return <span>&lt;{stringToHex(val)}&gt;</span>;
  }
  return <span>{val?.toString()}</span>;
}

function DictEntries(props: {
  dict?: Dict;
  array?: PDFVal[];
  depth?: number;
  onRefClick?: (ref: Ref) => void;
  expandPath?: string[];
}) {
  const { dict, array, depth = 0, onRefClick, expandPath } = props;
  const entries = dict
    ? [...dict._map.entries()]
    : array
      ? array.map((v, i) => [i, v])
      : [];

  return (
    <table className="w-full">
      <tbody>
        {entries.map(([key, val]) => {
          const isNested =
            val instanceof Dict ||
            Array.isArray(val) ||
            val instanceof FlateStream;
          const keyLabel = dict ? key.toString() : `[${key}]`;
          return (
            <DictEntryRow
              key={keyLabel}
              keyLabel={keyLabel}
              val={val}
              depth={depth}
              isNested={isNested}
              dict={dict}
              onRefClick={onRefClick}
              expandPath={expandPath}
            />
          );
        })}
      </tbody>
    </table>
  );
}

export default function ObjectDetail(props: {
  object: ObjectEntry | undefined;
  objects: ObjectMap;
  breadcrumb: Ref[];
  onBreadcrumbNavigate: (index: number) => void;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
  page: SuspenseResource<Page>;
  expandPath?: string[];
  onModifiedStream?: (stream: ModifiedStream | null) => void;
}) {
  const [activeExpandPath, setActiveExpandPath] = useState(props.expandPath);
  const clearHighlight = useCallback(() => setActiveExpandPath(undefined), []);

  const val = props.object?.val;
  if (val instanceof BaseStream) {
    val.getBytes();
  }
  const objStmNum = props.object?.fromObjStm;

  return (
    <ClearHighlightContext.Provider value={clearHighlight}>
      <div className="p-2 border-l border-gray-200 h-full overflow-auto">
        <div className="mb-4">
          <ObjectBreadcrumb
            path={props.breadcrumb}
            onNavigate={props.onBreadcrumbNavigate}
          />
          {objStmNum && (
            <div className="text-muted-foreground text-sm">
              Extracted from ObjStm&nbsp;
              <button
                type="button"
                className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-500 transition-colors font-mono text-sm cursor-pointer"
                onClick={() => props.onRefClick(objStmNum)}
              >
                {objStmNum.toString()}
              </button>
            </div>
          )}
        </div>
        {props.object && (
          <div>
            {val instanceof Dict &&
              ((val.get("Subtype") as Name | undefined)?.name === "Type3" ? (
                <Tabs defaultValue="font">
                  <div className="flex items-center">
                    <TabsList className="flex gap-2 w-fit">
                      <TabsTrigger value="font">Font</TabsTrigger>
                      <TabsTrigger value="dict">Dict</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="font">
                    <Type3FontView dict={val} onRefClick={props.onRefClick} />
                  </TabsContent>
                  <TabsContent value="dict">
                    <DictEntries
                      dict={val}
                      depth={0}
                      onRefClick={props.onRefClick}
                      expandPath={activeExpandPath}
                    />
                  </TabsContent>
                </Tabs>
              ) : (
                <DictEntries
                  dict={val}
                  depth={0}
                  onRefClick={props.onRefClick}
                  expandPath={activeExpandPath}
                />
              ))}
            {Array.isArray(val) &&
              (val.length > 0 ? (
                <DictEntries
                  array={val}
                  depth={0}
                  onRefClick={props.onRefClick}
                  expandPath={activeExpandPath}
                />
              ) : (
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 14,
                    color: "#888",
                  }}
                >
                  Array[0] (empty)
                </span>
              ))}
            {typeof val === "string" && (
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 14,
                  color: val === "" ? "#888" : undefined,
                }}
              >
                {val === "" ? '""' : val}
              </span>
            )}
            {val && val instanceof FlateStream && (
              <ContentStreamView
                contentStream={val.buffer.subarray(0, val.bufferLength)}
                entry={props.object}
                objects={props.objects}
                page={props.page}
                onRefClick={props.onRefClick}
                onModifiedStream={props.onModifiedStream}
                dictContent={
                  val.dict ? (
                    <DictEntries
                      dict={val.dict}
                      depth={0}
                      onRefClick={props.onRefClick}
                      expandPath={activeExpandPath}
                    />
                  ) : undefined
                }
              />
            )}
            {val && !(val instanceof FlateStream) && val instanceof Stream && (
              <ContentStreamView
                contentStream={val.bytes.slice(val.start, val.end)}
                entry={props.object}
                objects={props.objects}
                page={props.page}
                onRefClick={props.onRefClick}
                onModifiedStream={props.onModifiedStream}
                dictContent={
                  val.dict ? (
                    <DictEntries
                      dict={val.dict}
                      depth={0}
                      onRefClick={props.onRefClick}
                      expandPath={activeExpandPath}
                    />
                  ) : undefined
                }
              />
            )}
            {val &&
              !(val instanceof FlateStream) &&
              !(val instanceof Stream) &&
              val instanceof BaseStream && (
                <ContentStreamView
                  contentStream={
                    "buffer" in val && "bufferLength" in val
                      ? (val.buffer as Uint8Array).subarray(
                          0,
                          val.bufferLength as number,
                        )
                      : val.getBytes()
                  }
                  entry={props.object}
                  objects={props.objects}
                  page={props.page}
                  onRefClick={props.onRefClick}
                  onModifiedStream={props.onModifiedStream}
                  dictContent={
                    "dict" in val && val.dict ? (
                      <DictEntries
                        dict={val.dict as Dict}
                        depth={0}
                        onRefClick={props.onRefClick}
                        expandPath={activeExpandPath}
                      />
                    ) : undefined
                  }
                />
              )}

            {/* Fallback for other primitives */}
            {!(val instanceof Dict) &&
              !Array.isArray(val) &&
              !(val instanceof BaseStream) &&
              typeof val !== "string" && (
                <span style={{ fontFamily: "monospace", fontSize: 14 }}>
                  {String(val)}
                </span>
              )}
            {/* Backlinks section */}
            {props.object.backlinks && props.object.backlinks.length > 0 && (
              <ObjectBacklinks
                backlinks={props.object.backlinks}
                objects={props.objects}
                onRefClick={props.onRefClick}
              />
            )}
            {/* TODO: For a ObjStm, show the contained objects */}
            {
              <ObjectStmRefs
                objStm={props.object.ref}
                objects={props.objects}
                onRefClick={props.onRefClick}
              />
            }
          </div>
        )}
      </div>
    </ClearHighlightContext.Provider>
  );
}
