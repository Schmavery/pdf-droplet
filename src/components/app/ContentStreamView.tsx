import {
  SharedTooltipProvider,
  useSharedTooltip,
} from "@/components/ui/sharedtooltip";
import {
  getOpDoc,
  parseContentStream,
  printArgVal,
  type ArgVal,
  type OpTypes,
  type ParsedOp,
} from "@/lib/contentStream";
import { isICCProfile } from "@/lib/iccProfile";
import type { ObjectEntry } from "@/lib/loadPDF";
import { type SuspenseResource } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs";
import type { Page } from "@pdfjs/core/document";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Name, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";
import React, { useMemo } from "react";
import { Suspense } from "react";
import ICCProfileView from "./ICCProfileView";

const DocColorsBorder: Record<OpTypes, string> = {
  color: "border-red-400",
  image: "border-green-400",
  text: "border-blue-300",
  showtext: "border-blue-700",
  paint: "border-orange-500",
  path: "border-orange-300",
  state: "border-gray-400",
  markedcontent: "border-purple-400",
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

function ArgVal(props: {
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

const RichViewRow = React.memo(function RichViewRow(props: {
  index: number;
  parsedOps: ParsedOp[];
  resources: Dict;
  entry: ObjectEntry;
  style?: React.CSSProperties;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
}) {
  // const { index, style } = props;
  const { showTooltip, hideTooltip } = useSharedTooltip();
  const op = props.parsedOps[props.index];
  const doc = getOpDoc(op.op);
  return (
    <li
      style={{ ...props.style, marginLeft: `${op.indent / 2}em` }}
      className={`odd:bg-gray-100 px-2 py-1 flex border-l-4 ${
        doc ? DocColorsBorder[doc.type] : "border-transparent"
      }`}
    >
      {!doc && (
        <div>
          {op.args.map((v, i) => (
            <ArgVal
              key={i}
              val={v}
              op={op}
              resources={props.resources}
              entry={props.entry}
              onRefClick={props.onRefClick ?? (() => {})}
            />
          ))}{" "}
          {op.op}
        </div>
      )}
      {doc && (
        <div className="flex gap-1">
          {op.args.map((v, i) => (
            <ArgVal
              key={i}
              val={v}
              op={op}
              resources={props.resources}
              entry={props.entry}
              onRefClick={props.onRefClick}
            />
          ))}{" "}
          <button
            style={{ order: INLINE_IMAGE_OPS.includes(op.op) ? -1 : undefined }}
            onMouseEnter={(e) =>
              showTooltip(
                <div className="max-w-sm">
                  {doc.doc}
                  {doc.detail && <div className="mt-1">{doc.detail}</div>}
                </div>,
                e.currentTarget as HTMLElement,
              )
            }
            onMouseLeave={() => hideTooltip()}
          >
            <span className="font-bold">{op.op}</span>
          </button>
        </div>
      )}
    </li>
  );
});

function RichView(props: {
  contentStream: Uint8Array;
  page: SuspenseResource<Page>;
  entry: ObjectEntry;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
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

  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    startTransition(() => {
      setVisibleCount(ops.length);
    });
  }, [ops.length]);

  return (
    <SharedTooltipProvider>
      <ul>
        {ops.slice(0, visibleCount).map((_, i) => (
          <RichViewRow
            key={i}
            index={i}
            entry={props.entry}
            parsedOps={ops}
            resources={resources}
            onRefClick={props.onRefClick}
          />
        ))}
      </ul>
    </SharedTooltipProvider>
  );
}

export default function ContentStreamView(props: {
  entry: ObjectEntry;
  contentStream: Uint8Array;
  page: SuspenseResource<Page>;
  onRefClick: (ref: Ref, expandPath?: string[]) => void;
}) {
  if (
    ((props.entry.val instanceof Stream ||
      props.entry.val instanceof FlateStream) &&
      (props.entry.val.dict.get("Type") as Name)?.name === "XObject" &&
      (props.entry.val.dict.get("Subtype") as Name)?.name === "Form") ||
    props.entry.backlinks?.find((backlink) => backlink.hint !== undefined)
      ?.hint === "Contents"
  ) {
    return (
      <Tabs defaultValue="rich">
        <div className="flex items-center">
          <TabsList className="flex gap-2 w-fit">
            <TabsTrigger value="rich">Content Stream</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="rich">
          <Suspense fallback={<div>Loading?...</div>}>
            <RichView
              contentStream={props.contentStream}
              entry={props.entry}
              page={props.page}
              onRefClick={props.onRefClick}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="raw">
          <pre className="bg-gray-100 p-2 rounded mt-2 whitespace-pre-line break-all">
            {new TextDecoder("utf-8").decode(props.contentStream)}
          </pre>
        </TabsContent>
      </Tabs>
    );
  }

  if (isICCProfile(props.contentStream)) {
    return <ICCProfileView data={props.contentStream} />;
  }

  return (
    <pre className="bg-gray-100 p-2 rounded mt-2 whitespace-pre-line break-all">
      {new TextDecoder("utf-8").decode(props.contentStream)}
    </pre>
  );
}
