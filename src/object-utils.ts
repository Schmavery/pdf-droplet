import type { PDFVal } from "@/App";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Dict, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";

export function getObjectType(val: PDFVal): string {
  console.log("Determining type for value:", val);
  switch (true) {
    case val === null:
      return "null";
    case typeof val === "number":
      return "Number";
    case typeof val === "string":
      return "String";
    case val instanceof Array:
      return "Array";
    case val instanceof Ref:
      return "Ref";
    case val instanceof Dict: {
      const name = val.get("Type");
      if (name) {
        return `${name}`;
      }
      return "Dict";
    }
    case val instanceof Stream:
      return "Stream";
    case val instanceof FlateStream:
      return "FlateStream";
    default:
      return "unknown";
  }
}
