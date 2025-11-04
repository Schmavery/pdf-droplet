import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function RichView(props: {
  contentStream: Uint8Array;
  page: SuspenseResource<Page>;
  entry: ObjectEntry;
  onRefClick: (ref: Ref) => void;
}) {
  const resources = props.page.read().resources as Dict;
  console.log("Resources dict:", resources);
  const ops = parseContentStream(props.contentStream);
  console.log("Parsed ops:", ops);

  return (
    <ul className="">
      {ops.map((op, i) => {
        const doc = getOpDoc(op.op);
        return (
          <li
            key={i}
            style={{ marginLeft: `${op.indent / 2}em` }}
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
                    resources={resources}
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
                    resources={resources}
                    entry={props.entry}
                    onRefClick={props.onRefClick}
                  />
                ))}{" "}
                <Tooltip>
                  <TooltipTrigger>
                    <span className="font-bold">{op.op}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-sm">
                      {doc.doc}
                      {doc.detail && <div className="mt-1">{doc.detail}</div>}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ContentStreamView(props: {
  entry: ObjectEntry;
  contentStream: Uint8Array;
  page: SuspenseResource<Page>;
  onRefClick?: (ref: Ref) => void;
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
              onRefClick={props.onRefClick ?? (() => {})}
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
