import { useEffect } from "react";
import { List, useListRef, type RowComponentProps } from "react-window";

type HighlightType = "search" | "obj" | "custom";

interface HighlightRange {
  start: number;
  end: number;
  type: HighlightType;
  label?: string;
}

// const height = 400;
const rowHeight = 20;

export function HexView(props: {
  data: ArrayBuffer | Uint8Array;
  bytesPerRow?: number;
  highlights?: HighlightRange[];
  hideAscii?: boolean;
}) {
  console.log(props);
  const { data, bytesPerRow = 16, highlights = [], hideAscii = false } = props;
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const rowCount = Math.ceil(bytes.length / bytesPerRow);
  const listRef = useListRef(null);

  const getHighlightType = (index: number): HighlightType | undefined => {
    for (const h of highlights) {
      if (index >= h.start && index < h.end) return h.type;
    }
    return undefined;
  };

  // Precompute highlight color lookup for speed
  const highlightColor = (defaultColor: string, t?: HighlightType) =>
    t === "search"
      ? "bg-blue-200 text-blue-950"
      : t === "obj"
      ? "bg-amber-200 text-amber-950"
      : defaultColor;

  const Row = (props: RowComponentProps) => {
    if (hideAscii && props.index === 0) {
      return (
        <div style={props.style} className="text-[10px] font-mono text-muted-foreground select-none px-1">
          hex
        </div>
      );
    }
    const rowIndex = hideAscii ? props.index - 1 : props.index;
    const start = rowIndex * bytesPerRow;
    const slice = bytes.slice(start, start + bytesPerRow);

    const renderGroup = (
      config: { defaultColor: string; spacer: boolean },
      render: (b: number) => string
    ) => {
      const out: React.ReactNode[] = [];
      let currentGroup: string[] = [];
      let currentType = getHighlightType(start);

      const flush = (
        group: string[],
        type: HighlightType | undefined,
        key: number
      ) => {
        if (!group.length) return;
        out.push(
          <span
            key={key}
            className={`${
              config.spacer ? "px-1" : ""
            } font-mono ${highlightColor(config.defaultColor, type)}`}
          >
            {group.join(config.spacer ? " " : "")}
          </span>
        );
      };

      for (let j = 0; j < slice.length; j++) {
        const idx = start + j;
        const type = getHighlightType(idx);
        if (type !== currentType) {
          flush(currentGroup, currentType, j);
          currentGroup = [];
          currentType = type;
        }
        currentGroup.push(render(slice[j]));
      }
      flush(currentGroup, currentType, slice.length);
      return out;
    };

    const hexSpans = renderGroup(
      { defaultColor: "text-accent-foreground", spacer: true },
      (b) => b.toString(16).padStart(2, "0")
    );

    if (hideAscii) {
      return (
        <div
          style={props.style}
          className="font-mono text-sm whitespace-pre flex justify-around max-w-2xl"
        >
          <span className="hidden @xl:inline w-12 text-right pr-2 select-none text-blue-800">
            {start.toString(16)}
          </span>
          <div>{hexSpans}</div>
        </div>
      );
    }

    const asciiSpans = renderGroup(
      { defaultColor: "text-muted-foreground", spacer: false },
      (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ".")
    );

    return (
      <div
        style={props.style}
        className="font-mono text-sm whitespace-pre flex justify-around max-w-2xl"
      >
        <span className="hidden @xl:inline w-12 text-right pr-2 select-none text-blue-800">
          {start.toString(16)}
        </span>
        <div className="hidden @lg:inline">{hexSpans}</div>
        <div className="ml-4 ">{asciiSpans}</div>
      </div>
    );
  };

  const firstHighlight = highlights.length
    ? Math.min(...highlights.map((h) => h.start))
    : undefined;

  // Scroll to the first highlight
  useEffect(() => {
    console.log("helllo", listRef.current, firstHighlight, bytesPerRow);
    if (!listRef.current) return;
    const targetByte = firstHighlight;
    if (targetByte == null) return;

    const targetRow = Math.floor(targetByte / bytesPerRow);
    console.log("Scrolling to row", targetRow);
    // TODO figure this out
    setTimeout(() => {
      listRef.current?.scrollToRow({ index: targetRow, align: "smart" });
    }, 0);
    //
    // listRef.current.scrollToRow({ index: targetRow, align: "smart" });
  }, [firstHighlight, bytesPerRow, listRef]);

  return (
    <List
      className="p-2 bg-muted rounded-md border @container"
      listRef={listRef}
      rowComponent={Row}
      rowCount={hideAscii ? rowCount + 1 : rowCount}
      rowHeight={rowHeight}
      rowProps={{}}
    />
  );
}
