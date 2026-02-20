import { useMemo } from "react";
import type { ObjectMap } from "@/lib/loadPDF";
import { getObjectType } from "@/lib/objectUtils";
import { isRefsEqual, type Ref } from "@pdfjs/core/primitives";

export default function ObjStmView(props: {
  objStm: Ref;
  objects: ObjectMap;
  onRefClick: (ref: Ref) => void;
}) {
  const contained = useMemo(
    () =>
      [...props.objects.values()].filter(
        (o) => o.fromObjStm && isRefsEqual(o.fromObjStm, props.objStm),
      ),
    [props.objStm, props.objects],
  );

  return (
    <div className="mt-2 space-y-2">
      <div className="text-sm text-muted-foreground">
        Object stream containing {contained.length} object
        {contained.length !== 1 && "s"}
      </div>
      <ul className="space-y-0.5">
        {contained.map((entry) => (
          <li key={entry.ref.toString()} className="text-sm font-mono">
            <button
              type="button"
              style={{
                color: "#007bff",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
              onClick={() => props.onRefClick(entry.ref)}
            >
              {entry.ref.toString()}
            </button>{" "}
            <span className="text-muted-foreground">
              {getObjectType(entry)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}