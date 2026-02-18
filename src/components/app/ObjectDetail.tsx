import React, { useCallback, useContext, useState } from "react";
import {
  PDF_OBJS,
  type ObjectEntry,
  type ObjectMap,
  type PDFVal,
} from "@/lib/loadPDF";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Ref } from "@pdfjs/core/primitives";
import ObjectBacklinks from "./ObjectBacklinks";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ObjectBreadcrumb } from "@/components/app/ObjectBreadcrumb";
import { Stream } from "@pdfjs/core/stream";
import ObjectStmRefs from "@/components/app/ObjectStmRefs";
import ContentStreamView from "@/components/app/ContentStreamView";
import type { Page } from "@pdfjs/core/document";
import type { SuspenseResource } from "@/lib/utils";

const ClearHighlightContext = React.createContext<() => void>(() => {});

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

  // Helper for summary
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
      <li
        style={{ marginBottom: 4 }}
        className={isHighlighted ? "bg-blue-200 rounded" : undefined}
      >
        <Collapsible
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (expandPath?.length !== 0) clearHighlight();
          }}
        >
          <CollapsibleTrigger
            asChild
            style={{ background: "none", border: "none", padding: 0 }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontWeight: "bold",
                fontFamily: "monospace",
                fontSize: 14,
                cursor: "pointer",
                userSelect: "text",
              }}
            >
              <span
                className="caret"
                style={{
                  display: "inline-block",
                  transition: "transform 0.2s",
                  marginRight: 4,
                  width: 12,
                  height: 12,
                  transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                  userSelect: "none",
                }}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 12 12"
                  width="12"
                  height="12"
                  style={{ verticalAlign: "middle", userSelect: "none" }}
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
              </span>
              {keyLabel}:
              {summary && (
                <span style={{ color: "#888", marginLeft: 6 }}>{summary}</span>
              )}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div style={{ marginLeft: 16 }}>
              {renderValue(
                val,
                depth,
                onRefClick,
                shouldAutoExpand ? expandPath?.slice(1) : undefined,
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </li>
    );
  } else {
    return (
      <li
        style={{ marginBottom: 4 }}
        className={isHighlighted ? "bg-blue-200 rounded" : undefined}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontWeight: "bold",
            fontFamily: "monospace",
            fontSize: 14,
            userSelect: "text",
          }}
        >
          {keyLabel}: {renderValue(val, depth, onRefClick)}
        </span>
      </li>
    );
  }
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
        style={{
          color: "#007bff",
          background: "none",
          border: "none",
          cursor: "pointer",
          textDecoration: "underline",
          fontFamily: "monospace",
          fontSize: 14,
        }}
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
    <ul style={{ listStyle: "none", paddingLeft: depth * 16 }}>
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
    </ul>
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
}) {
  const [activeExpandPath, setActiveExpandPath] = useState(props.expandPath);
  const clearHighlight = useCallback(
    () => setActiveExpandPath(undefined),
    [],
  );

  const val = props.object?.val;
  if (val instanceof FlateStream) {
    val.getBytes();
  }
  console.log("Rendering ObjectDetail for object:", props.object, [
    ...PDF_OBJS,
  ]);

  const objStmNum = props.object?.fromObjStm;
  const matchingObj = [...PDF_OBJS].find(([, obj]) => {
    return (
      obj?.ref?.toString() === props.object?.ref.toString() &&
      obj?.bitmap &&
      obj?.bitmap instanceof ImageBitmap
    );
  })?.[1] as { bitmap: ImageBitmap } | undefined;

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
              style={{
                color: "#007bff",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: "monospace",
                fontSize: 14,
              }}
              onClick={() => props.onRefClick(objStmNum)}
            >
              {objStmNum.toString()}
            </button>
          </div>
        )}
      </div>
      {props.object && (
        <div>
          {val instanceof Dict && (
            <DictEntries
              dict={val}
              depth={0}
              onRefClick={props.onRefClick}
              expandPath={activeExpandPath}
            />
          )}
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
                style={{ fontFamily: "monospace", fontSize: 14, color: "#888" }}
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
          {val && typeof val === "object" && "dict" in val && (
            <DictEntries
              dict={(val as unknown as Stream).dict}
              depth={0}
              onRefClick={props.onRefClick}
              expandPath={activeExpandPath}
            />
          )}
          {val && val instanceof FlateStream && (
            <ContentStreamView
              contentStream={val.buffer}
              entry={props.object}
              page={props.page}
              onRefClick={props.onRefClick}
            />
          )}
          {val && !(val instanceof FlateStream) && val instanceof Stream && (
            <ContentStreamView
              contentStream={val.bytes.slice(val.start, val.end)}
              entry={props.object}
              page={props.page}
              onRefClick={props.onRefClick}
            />
          )}
          {matchingObj && (
            <div style={{ marginTop: 16 }}>
              <h3 className="font-bold mb-2">Rendered Image:</h3>
              <canvas
                width={matchingObj.bitmap.width}
                height={matchingObj.bitmap.height}
                style={{ border: "1px solid #ccc" }}
                ref={(canvas) => {
                  if (canvas) {
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                      ctx.drawImage(matchingObj.bitmap, 0, 0);
                    }
                  }
                }}
              />
            </div>
          )}

          {/* Fallback for other primitives */}
          {!(val instanceof Dict) &&
            !Array.isArray(val) &&
            !(val && typeof val === "object" && "dict" in val) &&
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
