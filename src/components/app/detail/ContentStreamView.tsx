import {
  SharedTooltipProvider,
  useSharedTooltip,
} from "@/components/ui/sharedtooltip";
import {
  getOpDoc,
  OP_CLOSE,
  OP_OPEN,
  parseContentStream,
  printArgVal,
  serializeOps,
  type ArgVal,
  type DocEntry,
  type OpTypes,
  type ParsedOp,
} from "@/lib/contentStream";
import { getFontFileHint, getCMapHint, getCIDSetHint } from "@/lib/objectUtils";
import { isCMap, isFontFile, isICCProfile, isImageXObject } from "@/lib/streamDetection";
import type { ObjectEntry, ObjectMap } from "@/lib/loadPDF";
import { type SuspenseResource } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs";
import type { Page } from "@pdfjs/core/document";
import { BaseStream } from "@pdfjs/core/base_stream";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Name, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";
import { Info } from "lucide-react";
import type { ModifiedStream } from "@/App";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Suspense } from "react";
import CMapView from "./CMapView";
import FontFileView from "./FontFileView";
import ICCProfileView from "./ICCProfileView";
import CIDSetView from "./CIDSetView";
import { HexView } from "./HexViewVirt";
import ImageView from "./ImageView";
import ObjStmView from "./ObjStmView";
import XRefView from "./XRefView";

const DocColorsBg: Record<OpTypes, string> = {
  color: "bg-red-400",
  image: "bg-green-400",
  text: "bg-blue-300",
  showtext: "bg-blue-700",
  paint: "bg-orange-500",
  path: "bg-orange-300",
  state: "bg-gray-400",
  markedcontent: "bg-purple-400",
};

type ResourceLookup = { ref: Ref; expandPath?: string[] };

/**
 * Look up a content-stream resource name (e.g. "E2" in /E2 gs) and return
 * a Ref that can be navigated to, plus an optional key-path to auto-expand
 * when the target is a parent container rather than the resource itself.
 *
 * Strategy per resources dict (entry resources first, then page resources):
 *  1. Direct ref – the name maps to an indirect object (e.g. /E2 21 0 R).
 *  2. Subdict ref – the name exists but is inline; link to the subdictionary
 *     itself if it is an indirect object (e.g. /ExtGState 15 0 R).
 *  3. Resources-dict ref – both the name and subdict are inline; link to the
 *     resources dict via its objId (e.g. 12R).
 */
function findResourceRef(
  subdictName: string,
  name: string,
  ...resourceDicts: (Dict | undefined)[]
): ResourceLookup | null {
  for (const resources of resourceDicts) {
    if (!resources) continue;

    const resourceDict = resources.get(subdictName) as Dict | undefined;
    if (!resourceDict) continue;

    const rawVal = resourceDict.getRaw(name);
    if (rawVal === undefined) continue;

    // 1. Direct ref to the resource object
    if (rawVal instanceof Ref) return { ref: rawVal };

    // 2. The resource is inline – try the subdictionary ref
    const rawSubdict = resources.getRaw(subdictName);
    if (rawSubdict instanceof Ref)
      return { ref: rawSubdict, expandPath: [name] };

    // 3. Both inline – try the resources dict's own object ref
    if (resources.objId) {
      const ref = Ref.fromString(resources.objId);
      if (ref) return { ref, expandPath: [subdictName, name] };
    }
  }
  return null;
}

function ArgValView(props: {
  val: ArgVal;
  op: ParsedOp;
  resources: Dict;
  entry: ObjectEntry;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
}) {
  let subdictName: string | null = null;

  switch (props.op.op) {
    case "Tf":
      subdictName = "Font";
      break;
    case "sh":
      subdictName = "Shading";
      break;
    case "Do":
      subdictName = "XObject";
      break;
    case "gs":
      subdictName = "ExtGState";
      break;
    case "CS":
    case "cs":
      subdictName = "ColorSpace";
      break;
    case "SCN":
    case "scn":
      subdictName = "Pattern";
      break;
  }

  if (subdictName && props.val.type === "name") {
    const entryVal = props.entry.val;
    const entryResources =
      entryVal instanceof FlateStream || entryVal instanceof Stream
        ? (entryVal.dict?.get("Resources") as Dict | undefined)
        : undefined;

    const lookup = findResourceRef(
      subdictName,
      props.val.name,
      entryResources,
      props.resources,
    );

    if (lookup) {
      return (
        <button
          type="button"
          style={{
            color: "#007bff",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            display: "inline",
            marginInline: "0.25em",
          }}
          aria-label={`Select resource ${lookup.ref.toString()}`}
          onClick={() => props.onRefClick(lookup.ref, lookup.expandPath)}
        >
          {printArgVal(props.val)}
        </button>
      );
    }
  }

  let strVal = printArgVal(props.val);
  if (INLINE_IMAGE_OPS.includes(props.op.op) && props.val.type === "dict") {
    strVal = Object.entries(props.val.entries)
      .map(([k, val]) => `/${k} ${printArgVal(val)}`)
      .join(" ");
  }

  return <span>{strVal}</span>;
}

const INLINE_IMAGE_OPS = ["BI", "ID", "EI"];

function DescArgs(props: {
  op: ParsedOp;
  doc: DocEntry | null;
  resources: Dict;
  entry: ObjectEntry;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
}) {
  const { op, doc } = props;
  if (op.args.length === 0) return null;
  return (
    <div className="mt-0.5 text-[10px] text-gray-400">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {op.args.map((v, i) => (
          <span key={i} className="font-mono break-all">
            {doc?.args?.[i] && (
              <span>{doc.args[i]}:&nbsp;</span>
            )}
            <ArgValView
              val={v}
              op={op}
              resources={props.resources}
              entry={props.entry}
              onRefClick={props.onRefClick}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function CmdArgs(props: {
  op: ParsedOp;
  doc: DocEntry | null;
  resources: Dict;
  entry: ObjectEntry;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
}) {
  const { op } = props;
  if (op.args.length === 0) return null;
  return (
    <span className="text-gray-500">
      {" "}
      {op.args.map((v, i) => (
        <React.Fragment key={i}>
          <ArgValView
            val={v}
            op={op}
            resources={props.resources}
            entry={props.entry}
            onRefClick={props.onRefClick}
          />
          {i < op.args.length - 1 && " "}
        </React.Fragment>
      ))}
    </span>
  );
}

const ROW_CV_STYLE: React.CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "auto 28px",
};

const CommandRow = React.memo(function CommandRow(props: {
  index: number;
  parsedOps: ParsedOp[];
  resources: Dict;
  entry: ObjectEntry;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
  disabled: boolean;
  onToggle: (index: number) => void;
}) {
  const { showTooltip, hideTooltip } = useSharedTooltip();
  const op = props.parsedOps[props.index];
  const doc = getOpDoc(op.op);
  const isGroupMarker = OP_OPEN.has(op.op) || OP_CLOSE.has(op.op);

  const sharedArgProps = {
    op,
    doc,
    resources: props.resources,
    entry: props.entry,
    onRefClick: props.onRefClick,
  };

  return (
    <li
      style={{ ...ROW_CV_STYLE, paddingLeft: `${8 + op.indent * 16}px` }}
      className={`border-b border-gray-100 py-1 text-xs hover:bg-gray-50/60 flex ${
        props.disabled && !isGroupMarker ? "opacity-40" : ""
      }`}
    >
      {/* Morphing indicator: thin bar in view mode → pill toggle in edit mode */}
      {!isGroupMarker && (
        <div className="self-stretch flex items-center flex-shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={!props.disabled}
            onClick={() => props.onToggle(props.index)}
            style={{
              transition:
                "width 400ms cubic-bezier(0.4,0,0.2,1), height 400ms cubic-bezier(0.4,0,0.2,1), border-radius 400ms cubic-bezier(0.4,0,0.2,1)",
            }}
            className={`flex-shrink-0 relative overflow-hidden
              pointer-events-none group-data-[edit]/modes:pointer-events-auto
              w-0.5 h-full rounded-[1px]
              group-data-[edit]/modes:w-6 group-data-[edit]/modes:h-4 group-data-[edit]/modes:rounded-full group-data-[edit]/modes:cursor-pointer
              ${doc ? DocColorsBg[doc.type] : "bg-gray-400"}
            `}
          >
            <span
              style={{
                left: props.disabled ? 2 : "calc(100% - 14px)",
                transition:
                  "opacity 200ms ease-in-out 180ms, left 200ms ease-in-out",
              }}
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]
                opacity-0 group-data-[edit]/modes:opacity-100"
            />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-1 px-2 min-w-0">

        {isGroupMarker ? (
          <div className="flex items-center gap-2 text-gray-400 min-w-0">
            <span className="font-mono text-xs">{op.op}</span>
            <span className="text-[10px] truncate">
              {doc?.label ?? doc?.doc}
            </span>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            {/* Cmd view -- shown only in cmd mode */}
            <div className="hidden group-data-[cmd]/modes:block font-mono text-gray-900 break-all">
              <button
                onMouseEnter={(e) =>
                  doc &&
                  showTooltip(
                    <div className="max-w-sm">
                      {doc.doc}
                      {doc.detail && (
                        <div className="mt-1">{doc.detail}</div>
                      )}
                    </div>,
                    e.currentTarget as HTMLElement,
                  )
                }
                onMouseLeave={() => hideTooltip()}
              >
                <span className="font-semibold">{op.op}</span>
              </button>
              <CmdArgs {...sharedArgProps} />
            </div>
            {/* Desc view -- hidden in cmd mode */}
            <div className="group-data-[cmd]/modes:hidden">
              <div className="flex items-center gap-1">
                <span className="text-gray-700 truncate">
                  {doc?.label ?? doc?.doc ?? op.op}
                </span>
                {doc?.detail && (
                  <button
                    type="button"
                    className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                    onMouseEnter={(e) =>
                      showTooltip(
                        <div className="max-w-sm">{doc.detail}</div>,
                        e.currentTarget as HTMLElement,
                      )
                    }
                    onMouseLeave={() => hideTooltip()}
                  >
                    <Info className="size-3" />
                  </button>
                )}
              </div>
              <DescArgs {...sharedArgProps} />
            </div>
          </div>
        )}
      </div>
    </li>
  );
});

function ModeToggle(props: {
  offLabel: string;
  onLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onCheckedChange(!props.checked)}
      className="relative inline-flex items-center w-[52px] h-[22px] rounded-full bg-blue-400/85 hover:bg-blue-500/90 active:bg-blue-500 cursor-pointer select-none flex-shrink-0 transition-colors duration-150"
    >
      <span
        className="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] z-10"
        style={{ transform: `translateX(${props.checked ? 30 : 0}px)` }}
      />
      <span
        className={`absolute inset-y-0 left-[19px] right-[3px] flex items-center justify-center text-[10px] font-semibold tracking-wide text-white/90 transition-opacity duration-200 pointer-events-none ${
          props.checked ? "opacity-0" : "opacity-100"
        }`}
      >
        {props.offLabel}
      </span>
      <span
        className={`absolute inset-y-0 left-[3px] right-[19px] flex items-center justify-center text-[10px] font-semibold tracking-wide text-white/90 transition-opacity duration-200 pointer-events-none ${
          props.checked ? "opacity-100" : "opacity-0"
        }`}
      >
        {props.onLabel}
      </span>
    </button>
  );
}

function RichView(props: {
  contentStream: Uint8Array;
  page: SuspenseResource<Page>;
  entry: ObjectEntry;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
  onModifiedStream?: (bytes: Uint8Array | null) => void;
}) {
  const page = props.page.read();
  const resources = useMemo(
    () => page.resources as Dict,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.pageIndex],
  );
  const ops = useMemo(
    () => parseContentStream(props.contentStream),
    [props.contentStream],
  );
  const [visibleCount, setVisibleCount] = React.useState(100);
  const [disabledOps, setDisabledOps] = useState<Set<number>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [showCmd, setShowCmd] = useState(false);

  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    startTransition(() => {
      setVisibleCount(ops.length);
    });
  }, [ops.length]);

  const { onModifiedStream } = props;
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!onModifiedStream) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (disabledOps.size === 0) return;
    }
    if (disabledOps.size === 0) {
      onModifiedStream(null);
    } else {
      onModifiedStream(serializeOps(opsRef.current, disabledOps));
    }
  }, [disabledOps, onModifiedStream]);

  const toggleOp = useCallback(
    (index: number) => {
      setDisabledOps((prev) => {
        const next = new Set(prev);
        const shouldDisable = !prev.has(index);

        const start = index;
        let end = index;

        if (OP_OPEN.has(ops[index].op)) {
          const openIndent = ops[index].indent;
          for (let j = index + 1; j < ops.length; j++) {
            if (ops[j].indent === openIndent && OP_CLOSE.has(ops[j].op)) {
              end = j;
              break;
            }
          }
        }

        for (let i = start; i <= end; i++) {
          if (shouldDisable) next.add(i);
          else next.delete(i);
        }
        return next;
      });
    },
    [ops],
  );

  return (
    <SharedTooltipProvider>
      <div
        className="group/modes"
        data-edit={editMode || undefined}
        data-cmd={showCmd || undefined}
      >
        <div className="sticky -top-2 z-20 flex items-center justify-between -mx-2 px-5 pt-4 pb-2 bg-white border-b border-gray-100">
          <h3 className="font-bold text-lg">Commands</h3>
          <div className="flex items-center gap-1.5">
            {props.onModifiedStream && (
              <ModeToggle
                offLabel="View"
                onLabel="Edit"
                checked={editMode}
                onCheckedChange={setEditMode}
              />
            )}
            <ModeToggle
              offLabel="Desc"
              onLabel="Cmd"
              checked={showCmd}
              onCheckedChange={setShowCmd}
            />
          </div>
        </div>
        <ul>
          {ops.slice(0, visibleCount).map((_, i) => (
            <CommandRow
              key={i}
              index={i}
              entry={props.entry}
              parsedOps={ops}
              resources={resources}
              onRefClick={props.onRefClick}
              disabled={disabledOps.has(i)}
              onToggle={toggleOp}
            />
          ))}
        </ul>
      </div>
    </SharedTooltipProvider>
  );
}

export default function ContentStreamView(props: {
  entry: ObjectEntry;
  contentStream: Uint8Array;
  objects: ObjectMap;
  page: SuspenseResource<Page>;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
  onModifiedStream?: (stream: ModifiedStream | null) => void;
  dictContent?: React.ReactNode;
}) {
  const isFormXObject =
    (props.entry.val instanceof Stream ||
      props.entry.val instanceof FlateStream) &&
    (props.entry.val.dict.get("Type") as Name)?.name === "XObject" &&
    (props.entry.val.dict.get("Subtype") as Name)?.name === "Form";
  const isPageContents =
    props.entry.backlinks?.find((backlink) => backlink.hint !== undefined)
      ?.hint === "Contents";

  const { onModifiedStream } = props;
  const entryRef = props.entry.ref;
  const richViewOnModified = useMemo<
    ((bytes: Uint8Array | null) => void) | undefined
  >(() => {
    if (!onModifiedStream || (!isPageContents && !isFormXObject))
      return undefined;
    return (bytes) =>
      onModifiedStream(bytes ? { ref: entryRef, bytes } : null);
  }, [onModifiedStream, isPageContents, isFormXObject, entryRef]);

  let richLabel: string | undefined;
  let richContent: React.ReactNode | undefined;

  if (isFormXObject || isPageContents) {
    richLabel = "Content Stream";
    richContent = (
      <Suspense fallback={<div>Loading?...</div>}>
        <RichView
          contentStream={props.contentStream}
          entry={props.entry}
          page={props.page}
          onRefClick={props.onRefClick}
          onModifiedStream={richViewOnModified}
        />
      </Suspense>
    );
  } else if (isICCProfile(props.contentStream)) {
    richLabel = "ICC Profile";
    richContent = <ICCProfileView data={props.contentStream} />;
  } else if (
    isFontFile(props.contentStream) ||
    getFontFileHint(props.entry.backlinks)
  ) {
    richLabel = "Font";
    richContent = <FontFileView data={props.contentStream} />;
  } else if (
    isCMap(props.contentStream) ||
    getCMapHint(props.entry.backlinks)
  ) {
    richLabel = "CMap";
    richContent = (
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground p-2">
            Parsing CMap…
          </div>
        }
      >
        <CMapView data={props.contentStream} />
      </Suspense>
    );
  } else if (getCIDSetHint(props.entry.backlinks)) {
    richLabel = "CIDSet";
    richContent = <CIDSetView data={props.contentStream} />;
  } else if (isImageXObject(props.entry.val)) {
    richLabel = "Image";
    richContent = <ImageView entry={props.entry} />;
  } else if (
    props.entry.val instanceof BaseStream &&
    (props.entry.val.dict?.get("Type") as Name)?.name === "ObjStm"
  ) {
    richLabel = "Object Stream";
    richContent = (
      <ObjStmView
        objStm={props.entry.ref}
        objects={props.objects}
        onRefClick={props.onRefClick}
      />
    );
  } else if (
    props.entry.val instanceof BaseStream &&
    (props.entry.val.dict?.get("Type") as Name)?.name === "XRef" &&
    props.entry.val.dict instanceof Dict
  ) {
    richLabel = "XRef";
    richContent = (
      <XRefView data={props.contentStream} dict={props.entry.val.dict} />
    );
  }

  const streamTextView = (
    <pre className="bg-gray-100 p-2 rounded mt-2 whitespace-pre-line break-all">
      {new TextDecoder("utf-8").decode(props.contentStream)}
    </pre>
  );

  const streamHexView = <HexView data={props.contentStream} hideAscii />;

  if (!richContent) {
    return (
      <>
        {props.dictContent}
        <Tabs defaultValue="text">
          <div className="flex items-center">
            <TabsList className="flex gap-2 w-fit">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="hex">Hex</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="text">{streamTextView}</TabsContent>
          <TabsContent value="hex">{streamHexView}</TabsContent>
        </Tabs>
      </>
    );
  }

  return (
    <Tabs defaultValue="rich">
      <div className="flex items-center">
        <TabsList className="flex gap-2 w-fit">
          <TabsTrigger value="rich">{richLabel}</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="hex">Hex</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="rich">{richContent}</TabsContent>
      <TabsContent value="text">
        {props.dictContent}
        {streamTextView}
      </TabsContent>
      <TabsContent value="hex">
        {props.dictContent}
        {streamHexView}
      </TabsContent>
    </Tabs>
  );
}
