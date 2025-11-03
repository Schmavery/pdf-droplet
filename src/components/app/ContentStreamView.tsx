import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getOpDoc,
  parseContentStream,
  printArgVal,
  type OpTypes,
} from "@/lib/contentStream";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@components/ui/tabs";
import { CircleQuestionMark } from "lucide-react";

const DocColors: Record<OpTypes, string> = {
  color: "text-red-400",
  image: "text-green-400",
  text: "text-blue-300",
  showtext: "text-blue-700",
  paint: "text-purple-400",
  path: "text-yellow-400",
  state: "text-gray-400",
  markedcontent: "text-orange-400",
};

function RichView(props: { contentStream: Uint8Array }) {
  const ops = parseContentStream(props.contentStream);

  return (
    <ul className="">
      {ops.map((op, i) => {
        const doc = getOpDoc(op.op);
        return (
          <li
            key={i}
            style={{ marginLeft: `${op.indent / 2}em` }}
            className="odd:bg-gray-100 px-2 py-1 flex border-l-2"
          >
            <div>
              {op.args.map(printArgVal).join(" ")} {op.op}
            </div>
            {doc && (
              <div
                className={`italic pl-1 ml-auto ${
                  DocColors[doc?.type]
                } text-sm flex items-center gap-1 text-right`}
              >
                {doc.doc}
                {doc.detail && (
                  <Tooltip>
                    <TooltipTrigger>
                      <CircleQuestionMark size={"1.25em"} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="max-w-sm">{doc.detail}</div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ContentStreamView(props: {
  contentStream: Uint8Array;
}) {
  return (
    <Tabs defaultValue="rich">
      <div className="flex items-center">
        <TabsList className="flex gap-2 w-fit">
          <TabsTrigger value="rich">Content Stream</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="rich">
        <RichView contentStream={props.contentStream} />
      </TabsContent>
      <TabsContent value="raw">
        <pre className="bg-gray-100 p-2 rounded mt-2 whitespace-pre-line">
          {new TextDecoder("utf-8").decode(props.contentStream)}
        </pre>
      </TabsContent>
    </Tabs>
  );
}
