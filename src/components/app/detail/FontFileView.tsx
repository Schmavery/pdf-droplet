import { useMemo, useState } from "react";
import {
  inspectFont,
  inspectCFFFont,
  inspectType1Font,
  type FontInspection,
  type CFFInspection,
  type GlyphEntry,
  type FontTableEntry,
  type FontCmapSubtable,
} from "@/lib/fontFile";
import type { Ref } from "@pdfjs/core/primitives";
import { BADGE_COLORS, type NormalizedFont } from "@/lib/fontFile";

function normalizeSfnt(font: FontInspection): NormalizedFont {
  const identityRows: [string, string][] = [];
  if (font.names.postScriptName)
    identityRows.push(["PostScript Name", font.names.postScriptName]);
  if (font.names.version) identityRows.push(["Version", font.names.version]);
  if (font.numGlyphs != null) {
    const present = font.getGlyphsByIndex().length;
    if (present < font.numGlyphs) {
      identityRows.push([
        "Glyphs",
        `${present} of ${font.numGlyphs.toLocaleString()} (subsetted)`,
      ]);
    } else {
      identityRows.push(["Glyphs", font.numGlyphs.toLocaleString()]);
    }
  }
  if (font.os2) identityRows.push(["Weight", font.os2.weightClassName]);

  const metricsRows: [string, string][] = [];
  if (font.head) {
    metricsRows.push(["Units per Em", font.head.unitsPerEm.toString()]);
    metricsRows.push([
      "Bounding Box",
      `[${font.head.xMin}, ${font.head.yMin}] – [${font.head.xMax}, ${font.head.yMax}]`,
    ]);
    if (font.macStyleFlags.length > 0)
      metricsRows.push(["Mac Style", font.macStyleFlags.join(", ")]);
    if (font.head.created)
      metricsRows.push([
        "Created",
        font.head.created.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      ]);
    if (font.head.modified)
      metricsRows.push([
        "Modified",
        font.head.modified.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      ]);
  }
  if (font.hhea) {
    metricsRows.push(["Ascender", font.hhea.ascender.toString()]);
    metricsRows.push(["Descender", font.hhea.descender.toString()]);
    metricsRows.push(["Line Gap", font.hhea.lineGap.toString()]);
  }
  if (font.os2) {
    metricsRows.push(["Width", font.os2.widthClassName]);
    if (font.os2.vendorID) metricsRows.push(["Vendor", font.os2.vendorID]);
    if (font.fsSelectionFlags.length > 0)
      metricsRows.push(["Selection Flags", font.fsSelectionFlags.join(", ")]);
    metricsRows.push([
      "Char Range",
      `U+${font.os2.firstCharIndex.toString(16).toUpperCase().padStart(4, "0")} – U+${font.os2.lastCharIndex.toString(16).toUpperCase().padStart(4, "0")}`,
    ]);
    if (font.os2.panose.some((v) => v !== 0))
      metricsRows.push(["Panose", font.os2.panose.join(" ")]);
    if (font.os2.typoAscender != null)
      metricsRows.push(["Typo Ascender", font.os2.typoAscender.toString()]);
    if (font.os2.typoDescender != null)
      metricsRows.push(["Typo Descender", font.os2.typoDescender.toString()]);
    if (font.os2.typoLineGap != null)
      metricsRows.push(["Typo Line Gap", font.os2.typoLineGap.toString()]);
  }
  if (font.post) {
    metricsRows.push(["Italic Angle", `${font.post.italicAngle}°`]);
    metricsRows.push(["Fixed Pitch", font.post.isFixedPitch ? "Yes" : "No"]);
    metricsRows.push([
      "Underline",
      `pos ${font.post.underlinePosition}, thickness ${font.post.underlineThickness}`,
    ]);
  }
  if (font.names.manufacturer)
    metricsRows.push(["Manufacturer", font.names.manufacturer]);
  if (font.names.designer) metricsRows.push(["Designer", font.names.designer]);

  const h = font.head;
  const upm = h?.unitsPerEm || 1000;
  const xMin = (h ? h.xMin : 0) / upm;
  const yMin = (h ? h.yMin : -200) / upm;
  const xMax = (h ? h.xMax : upm) / upm;
  const yMaxVal = (h ? h.yMax : 800) / upm;
  let viewBox: string;
  let yMax: number;
  if ([xMin, yMin, xMax, yMaxVal].some((v) => !Number.isFinite(v))) {
    viewBox = "-0.1 0 1.2 1.3";
    yMax = 1.1;
  } else {
    const pad = (yMaxVal - yMin) * 0.04;
    viewBox = `${xMin - pad} 0 ${xMax - xMin + pad * 2} ${yMaxVal - yMin + pad * 2}`;
    yMax = yMaxVal + pad;
  }

  return {
    format: font.format,
    badgeColor: BADGE_COLORS[font.format] ?? "bg-gray-100 text-gray-800",
    displayName: font.names.fullName ?? font.names.family,
    extraBadges: [],
    identityRows,
    metricsRows,
    glyphError: font.glyphError,
    hasCmap: font.hasCmap,
    getGlyphSVG: font.getGlyphSVG,
    getMappedCodePoints: font.getMappedCodePoints,
    getGlyphsByIndex: font.getGlyphsByIndex,
    viewBox,
    yMax,
    notice: font.names.copyright ?? font.names.license,
    tables: font.tables,
    cmapSubtables: font.cmapSubtables,
  };
}

function normalizeCFF(cff: CFFInspection): NormalizedFont {
  const noop = () => null;
  const empty = () => [] as number[];
  return {
    format: cff.format,
    badgeColor: BADGE_COLORS[cff.format] ?? "bg-gray-100 text-gray-800",
    displayName: cff.fontName,
    extraBadges: [],
    identityRows: cff.identityEntries,
    metricsRows: cff.metricsEntries,
    glyphError: cff.glyphError,
    hasCmap: false,
    getGlyphSVG: noop,
    getMappedCodePoints: empty,
    getGlyphsByIndex: cff.getGlyphsByIndex,
    viewBox: "-0.1 0 1.2 1.3",
    yMax: 1.1,
    notice: cff.notice,
  };
}

// ── Glyph grid ─────────────────────────────────────────────────────────

const PREVIEW_CHARS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
].map((c) => c.codePointAt(0)!);

const INDEX_PREVIEW_LIMIT = 50;

function GlyphCell({
  id,
  svgPath,
  viewBox,
  yMax,
  isGlyphIndex,
  glyphName,
  unicodeChar,
  onClick,
}: {
  id: number;
  svgPath: string;
  viewBox: string;
  yMax: number;
  isGlyphIndex?: boolean;
  glyphName?: string;
  unicodeChar?: string;
  onClick?: () => void;
}) {
  let label: string;
  let displayLabel: string;
  if (glyphName) {
    label = unicodeChar
      ? `${glyphName} → ${unicodeChar}`
      : glyphName;
    displayLabel = unicodeChar ?? glyphName;
  } else if (isGlyphIndex) {
    label = `GID ${id}`;
    displayLabel = `#${id}`;
  } else {
    label = `U+${id.toString(16).toUpperCase().padStart(4, "0")} ${String.fromCodePoint(id)}`;
    displayLabel = id.toString(16).toUpperCase().padStart(4, "0");
  }
  return (
    <div
      className={`flex flex-col items-center border border-gray-200 rounded overflow-hidden bg-white hover:border-gray-400 transition-colors${onClick ? " cursor-pointer" : ""}`}
      title={label}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="p-1.5 flex items-center justify-center">
        {svgPath ? (
          <svg viewBox={viewBox} className="w-8 h-8" aria-label={label}>
            <g transform={`translate(0,${yMax}) scale(1,-1)`}>
              <path d={svgPath} fill="currentColor" />
            </g>
          </svg>
        ) : (
          <span className="w-8 h-8" />
        )}
      </div>
      <span className="text-[9px] text-muted-foreground font-mono leading-none bg-gray-100 w-full text-center py-0.5 truncate px-0.5">
        {displayLabel}
      </span>
    </div>
  );
}

function GlyphGrid({
  font,
  showAll,
  onRefClick,
}: {
  font: NormalizedFont;
  showAll: boolean;
  onRefClick?: (ref: Ref) => void;
}) {
  const glyphs = useMemo((): GlyphEntry[] => {
    if (!font.hasCmap) {
      const all = font.getGlyphsByIndex();
      return showAll ? all : all.slice(0, INDEX_PREVIEW_LIMIT);
    }

    if (showAll) {
      const codePoints = font.getMappedCodePoints().slice(0, 256);
      const result: GlyphEntry[] = [];
      for (const cp of codePoints) {
        const svg = font.getGlyphSVG(cp);
        if (svg) result.push({ id: cp, svgPath: svg });
      }
      if (result.length < 8) return font.getGlyphsByIndex();
      return result.sort((a, b) => a.id - b.id);
    }

    const result: GlyphEntry[] = [];
    for (const cp of PREVIEW_CHARS) {
      const svg = font.getGlyphSVG(cp);
      if (svg) result.push({ id: cp, svgPath: svg });
    }
    if (result.length < 8) {
      const seen = new Set(result.map((g) => g.id));
      for (const cp of font.getMappedCodePoints().slice(0, 256)) {
        if (seen.has(cp)) continue;
        const svg = font.getGlyphSVG(cp);
        if (svg) result.push({ id: cp, svgPath: svg });
      }
    }
    if (result.length < 8) return font.getGlyphsByIndex();
    return result.sort((a, b) => a.id - b.id);
  }, [font, showAll]);

  if (glyphs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic space-y-1">
        <p>No renderable glyphs found.</p>
        {font.glyphError && (
          <p className="text-red-600 not-italic font-mono text-xs">
            {font.glyphError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(3.25rem, 1fr))" }}
    >
      {glyphs.map(({ id, svgPath, isGlyphIndex, glyphName, unicodeChar, ref }) => (
        <GlyphCell
          key={glyphName ?? (isGlyphIndex ? `gid-${id}` : id)}
          id={id}
          svgPath={svgPath}
          viewBox={font.viewBox}
          yMax={font.yMax}
          isGlyphIndex={isGlyphIndex}
          glyphName={glyphName}
          unicodeChar={unicodeChar}
          onClick={ref && onRefClick ? () => onRefClick(ref) : undefined}
        />
      ))}
    </div>
  );
}

// ── Shared table components ────────────────────────────────────────────

function MetadataTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm font-mono">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-gray-100">
            <td className="py-1 pr-4 text-muted-foreground whitespace-nowrap align-top font-semibold">
              {label}
            </td>
            <td className="py-1 break-all">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function TableDirectory({ tables }: { tables: FontTableEntry[] }) {
  return (
    <table className="w-full text-sm font-mono">
      <thead>
        <tr className="border-b border-gray-300 text-muted-foreground">
          <th className="py-1 pr-3 text-left font-semibold">Tag</th>
          <th className="py-1 pr-3 text-right font-semibold">Offset</th>
          <th className="py-1 text-right font-semibold">Size</th>
        </tr>
      </thead>
      <tbody>
        {tables.map((t) => (
          <tr key={t.tag} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-1 pr-3 font-semibold">{t.tag}</td>
            <td className="py-1 pr-3 text-right text-muted-foreground">
              {t.offset}
            </td>
            <td className="py-1 text-right text-muted-foreground">
              {formatBytes(t.length)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CmapSubtables({ subtables }: { subtables: FontCmapSubtable[] }) {
  return (
    <table className="w-full text-sm font-mono">
      <thead>
        <tr className="border-b border-gray-300 text-muted-foreground">
          <th className="py-1 pr-3 text-left font-semibold">Platform</th>
          <th className="py-1 pr-3 text-right font-semibold">Encoding</th>
          <th className="py-1 text-right font-semibold">Format</th>
        </tr>
      </thead>
      <tbody>
        {subtables.map((st, i) => (
          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-1 pr-3">
              {st.platformName}{" "}
              <span className="text-muted-foreground">({st.platformID})</span>
            </td>
            <td className="py-1 pr-3 text-right text-muted-foreground">
              {st.encodingID}
            </td>
            <td className="py-1 text-right text-muted-foreground">
              {st.format}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Shared layout ──────────────────────────────────────────────────────

export function FontView({ font, onRefClick }: { font: NormalizedFont; onRefClick?: (ref: Ref) => void }) {
  const [showAllGlyphs, setShowAllGlyphs] = useState(false);

  const hasGlyphToggle =
    font.hasCmap || font.getGlyphsByIndex().length > INDEX_PREVIEW_LIMIT;

  return (
    <div className="mt-2 space-y-4">
      {/* Header + key identity info */}
      <div className="bg-gray-50 border rounded-md p-3">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${font.badgeColor}`}
          >
            {font.format}
          </span>
          {font.extraBadges.map((b) => (
            <span
              key={b.label}
              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${b.color}`}
            >
              {b.label}
            </span>
          ))}
          {font.displayName && (
            <span className="text-sm font-semibold truncate">
              {font.displayName}
            </span>
          )}
        </div>
        <MetadataTable rows={font.identityRows} />
      </div>

      {/* Glyph preview */}
      <div className="bg-gray-50 border rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Glyphs</h4>
          {hasGlyphToggle && (
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setShowAllGlyphs((v) => !v)}
            >
              {font.hasCmap
                ? showAllGlyphs
                  ? "Common characters"
                  : "Show all mapped"
                : showAllGlyphs
                  ? "Show preview"
                  : "Show all"}
            </button>
          )}
        </div>
        <GlyphGrid font={font} showAll={showAllGlyphs} onRefClick={onRefClick} />
      </div>

      {/* Metrics (detailed) */}
      {font.metricsRows.length > 0 && (
        <div className="bg-gray-50 border rounded-md p-3">
          <h4 className="text-sm font-semibold mb-2">Metrics</h4>
          <MetadataTable rows={font.metricsRows} />
        </div>
      )}

      {/* Table directory (sfnt only) */}
      {font.tables && font.tables.length > 0 && (
        <div className="bg-gray-50 border rounded-md p-3">
          <h4 className="text-sm font-semibold mb-2">
            Tables ({font.tables.length})
          </h4>
          <div className="overflow-x-auto">
            <TableDirectory tables={font.tables} />
          </div>
        </div>
      )}

      {/* Cmap subtables (sfnt only) */}
      {font.cmapSubtables && font.cmapSubtables.length > 0 && (
        <div className="bg-gray-50 border rounded-md p-3">
          <h4 className="text-sm font-semibold mb-2">
            Character Maps ({font.cmapSubtables.length})
          </h4>
          <div className="overflow-x-auto">
            <CmapSubtables subtables={font.cmapSubtables} />
          </div>
        </div>
      )}

      {font.notice && (
        <p className="text-xs text-muted-foreground px-1 whitespace-pre-wrap">
          {font.notice}
        </p>
      )}
    </div>
  );
}

// ── Main component (stream-based fonts) ────────────────────────────────

export default function FontFileView({ data }: { data: Uint8Array }) {
  const font = useMemo((): NormalizedFont | null => {
    const sfnt = inspectFont(data);
    if (sfnt) return normalizeSfnt(sfnt);
    const cff = inspectCFFFont(data);
    if (cff) return normalizeCFF(cff);
    const t1 = inspectType1Font(data);
    if (t1) return normalizeCFF(t1);
    return null;
  }, [data]);

  if (!font) return null;
  return <FontView font={font} />;
}
