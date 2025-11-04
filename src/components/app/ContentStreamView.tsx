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
import type { ObjectEntry } from "@/lib/loadPDF";
import { type SuspenseResource } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs";
import type { Page } from "@pdfjs/core/document";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Name, Ref } from "@pdfjs/core/primitives";
import React, { useMemo } from "react";
import { Suspense } from "react";

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

function ArgVal(props: {
  val: ArgVal;
  op: ParsedOp;
  resources: Dict;
  entry: ObjectEntry;
  onRefClick: (ref: Ref) => void;
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
    let resourceRef: Ref | null = null;

    const entryResources =
      props.entry.val instanceof FlateStream
        ? (props.entry.val.dict.get("Resources") as Dict)
        : null;

    if (entryResources) {
      const resourceDict = entryResources.get(subdictName) as Dict;
      resourceRef = resourceDict?.getRaw(props.val.name) as Ref;
    }

    if (!resourceRef && props.resources) {
      const resourceDict = props.resources.get(subdictName) as Dict;
      resourceRef = resourceDict.getRaw(props.val.name) as Ref;
    }

    if (resourceRef && resourceRef instanceof Ref) {
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
          aria-label={`Select resource ${resourceRef.toString()}`}
          onClick={() => props.onRefClick(resourceRef)}
        >
          {printArgVal(props.val)}
        </button>
      );
    }
  }

  return <span>{printArgVal(props.val)}</span>;
}

const RichViewRow = React.memo(function RichViewRow(props: {
  index: number;
  parsedOps: ParsedOp[];
  resources: Dict;
  entry: ObjectEntry;
  style?: React.CSSProperties;
  onRefClick: (ref: Ref) => void;
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
        <div>
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
            onMouseEnter={(e) =>
              showTooltip(
                <div className="max-w-sm">
                  {doc.doc}
                  {doc.detail && <div className="mt-1">{doc.detail}</div>}
                </div>,
                e.currentTarget as HTMLElement
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
  onRefClick: (ref: Ref) => void;
}) {
  const page = props.page.read();
  const resources = useMemo(
    () => page.resources as Dict,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page.pageIndex]
  );
  const ops = useMemo(
    () => parseContentStream(props.contentStream),
    [props.contentStream]
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

  // return (
  //   <List
  //     className="p-2 bg-muted rounded-md border @container"
  //     rowComponent={RichViewRow}
  //     rowCount={ops.length}
  //     rowHeight={rowHeight}
  //     rowProps={{
  //       resources,
  //       parsedOps: ops,
  //       entry: props.entry,
  //       onRefClick: props.onRefClick,
  //     }}
  //   />
  // );
}

export default function ContentStreamView(props: {
  entry: ObjectEntry;
  contentStream: Uint8Array;
  page: SuspenseResource<Page>;
  onRefClick: (ref: Ref) => void;
}) {
  if (
    (props.entry.val instanceof FlateStream &&
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
          <pre className="bg-gray-100 p-2 rounded mt-2 whitespace-pre-line">
            {new TextDecoder("utf-8").decode(props.contentStream)}
          </pre>
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <pre className="bg-gray-100 p-2 rounded mt-2 whitespace-pre-line">
      {new TextDecoder("utf-8").decode(props.contentStream)}
    </pre>
  );
}
