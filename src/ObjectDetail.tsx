import React from "react";
import type { ObjectEntry, ObjectMap, PDFVal } from "@/loadPDF";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Ref } from "@pdfjs/core/primitives";
import ObjectBacklinks from "./ObjectBacklinks";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ObjectBreadcrumb } from "@/ObjectBreadcrumb";
import type { Stream } from "@pdfjs/core/stream";

function DictEntryRow({
  keyLabel,
  val,
  depth,
  isNested,
  onRefClick,
}: {
  keyLabel: string;
  val: PDFVal;
  depth: number;
  isNested: boolean;
  dict?: Dict;
  onRefClick?: (ref: Ref) => void;
}) {
  const [open, setOpen] = React.useState(false);
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
      <li style={{ marginBottom: 4 }}>
        <Collapsible open={open} onOpenChange={setOpen}>
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
              {renderValue(val, depth, onRefClick)}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </li>
    );
  } else {
    return (
      <li style={{ marginBottom: 4 }}>
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
  onRefClick?: (ref: Ref) => void
) {
  if (val instanceof Dict) {
    return <DictEntries dict={val} depth={depth + 1} onRefClick={onRefClick} />;
  }
  if (Array.isArray(val)) {
    return (
      <DictEntries array={val} depth={depth + 1} onRefClick={onRefClick} />
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
      <DictEntries dict={val.dict} depth={depth + 1} onRefClick={onRefClick} />
    );
  }
  return <span>{val?.toString()}</span>;
}

function DictEntries(props: {
  dict?: Dict;
  array?: PDFVal[];
  depth?: number;
  onRefClick?: (ref: Ref) => void;
}) {
  const { dict, array, depth = 0, onRefClick } = props;
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
  onRefClick: (ref: Ref) => void;
}) {
  const val = props.object?.val;
  if (val instanceof FlateStream) {
    val.getBytes();
  }
  console.log("Rendering ObjectDetail for object:", props.object);
  return (
    <div className="p-2 border-l border-gray-200 h-full overflow-auto">
      <ObjectBreadcrumb
        path={props.breadcrumb}
        onNavigate={props.onBreadcrumbNavigate}
      />
      {props.object && (
        <div>
          {val instanceof Dict && (
            <DictEntries dict={val} depth={0} onRefClick={props.onRefClick} />
          )}
          {Array.isArray(val) &&
            (val.length > 0 ? (
              <DictEntries
                array={val}
                depth={0}
                onRefClick={props.onRefClick}
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
            />
          )}
          {val && val instanceof FlateStream && (
            <pre className="bg-gray-100 p-2 rounded mt-2 overflow-x-auto">
              {new TextDecoder("utf-8").decode(val.buffer)}
            </pre>
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
        </div>
      )}
    </div>
  );
}
