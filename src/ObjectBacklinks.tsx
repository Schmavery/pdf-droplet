import React from "react";
import type { ObjectEntry } from "@/App";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { getObjectType } from "@/object-utils";
import type { Ref } from "@pdfjs/core/primitives";

export default function ObjectBacklinks({
  backlinks,
  onRefClick,
}: {
  backlinks: ObjectEntry[];
  onRefClick: (ref: Ref) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (!backlinks || backlinks.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
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
              fontSize: 16,
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
                userSelect: "none",
                transform: open ? "rotate(0deg)" : "rotate(-90deg)",
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
            Referenced by ({backlinks.length})
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul style={{ marginTop: 8 }}>
            {backlinks.map((entry) => (
              <li key={entry.ref.toString()}>
                {`${getObjectType(entry.val)}`}{" "}
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
                  onClick={() => onRefClick(entry.ref)}
                >
                  {entry.ref.toString()}
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
