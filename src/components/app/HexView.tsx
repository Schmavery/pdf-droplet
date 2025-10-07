import { useEffect, useRef } from "react";

type HighlightType = "search" | "obj" | "custom";

interface HighlightRange {
  start: number;
  end: number;
  type: HighlightType;
  label?: string;
}

export function HexView(props: {
  data: ArrayBuffer | Uint8Array;
  bytesPerRow?: number;
  highlights?: HighlightRange[];
}) {
  const { data, bytesPerRow = 16, highlights = [] } = props;
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  console.log("HexView highlights", highlights);

  const getHighlightType = (index: number): HighlightType | undefined => {
    for (const h of highlights) {
      if (index >= h.start && index < h.end) return h.type;
    }
    return undefined;
  };

  const groupBytes = (
    slice: Uint8Array,
    offset: number,
    render: (b: number) => string
  ) => {
    const parts: React.ReactNode[] = [];
    let currentGroup: string[] = [];
    let currentType = getHighlightType(offset);

    const flush = (
      group: string[],
      type: HighlightType | undefined,
      key: number
    ) => {
      if (!group.length) return;
      const color =
        type === "search"
          ? "bg-blue-200 text-blue-950"
          : type === "obj"
          ? "bg-amber-200 text-amber-950"
          : "text-muted-foreground";

      parts.push(
        <span key={key} className={`px-1 font-mono ${color}`}>
          {group.join(" ")}
        </span>
      );
    };

    for (let j = 0; j < slice.length; j++) {
      const index = offset + j;
      const type = getHighlightType(index);
      if (type !== currentType) {
        flush(currentGroup, currentType, j);
        currentGroup = [];
        currentType = type;
      }
      currentGroup.push(render(slice[j]));
    }

    flush(currentGroup, currentType, slice.length);
    return parts;
  };

  const rows = [];
  for (let i = 0; i < bytes.length; i += bytesPerRow) {
    const slice = bytes.slice(i, i + bytesPerRow);
    const hexSpans = groupBytes(slice, i, (b) =>
      b.toString(16).padStart(2, "0")
    );
    const asciiSpans = groupBytes(slice, i, (b) =>
      b >= 32 && b <= 126 ? String.fromCharCode(b) : "."
    );

    rows.push(
      <div
        key={i}
        ref={(el) => {
          if (el) rowRefs.current.set(i, el);
        }}
        className="font-mono text-sm whitespace-pre"
      >
        <span className="text-muted-foreground w-10 inline-block text-right pr-2">
          {i.toString(16)}
        </span>{" "}
        {hexSpans} <span className="ml-4">{asciiSpans}</span>
      </div>
    );
  }

  // Scroll behavior — scrolls to first highlight
  useEffect(() => {
    if (!containerRef.current) return;

    const targetByte = highlights.length
      ? Math.min(...highlights.map((h) => h.start))
      : undefined;
    if (targetByte == null) return;

    const rowStart = Math.floor(targetByte / bytesPerRow) * bytesPerRow;
    const rowEl = rowRefs.current.get(rowStart);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlights, bytesPerRow]);

  return (
    <div
      ref={containerRef}
      className="p-3 bg-muted rounded-md border overflow-auto max-h-[400px]"
    >
      {rows}
      {highlights.some((h) => h.label) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {highlights
            .filter((h) => h.label)
            .map((h, i) => {
              const color =
                h.type === "search"
                  ? "bg-blue-200 text-blue-950"
                  : h.type === "obj"
                  ? "bg-amber-200 text-amber-950"
                  : "bg-secondary text-secondary-foreground";
              return (
                <span key={i} className={`px-2 py-0.5 rounded-sm ${color}`}>
                  {h.label}
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
}
