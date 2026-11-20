"use client";

import {
  SAFE_ZONE_CONTENT_9X16,
  SAFE_ZONE_POLYGON_9X16,
  SAFE_ZONE_REFERENCE,
  textSafeZonePolygonPath,
} from "@/lib/generation/safe-zone";

/**
 * Development preview of the 9:16 text safe zone.
 * Red = excluded / platform UI risk. Clear hole = allowed text area.
 * Never bake this into exported downloads — preview only.
 */
export function SafeZoneOverlay({
  className = "",
  showRegions = true,
}: {
  className?: string;
  /** Draw dashed outlines for the primary and lower content-safe pads. */
  showRegions?: boolean;
}) {
  const { width, height } = SAFE_ZONE_REFERENCE;
  const hole = textSafeZonePolygonPath(SAFE_ZONE_POLYGON_9X16);
  const { primary, lower } = SAFE_ZONE_CONTENT_9X16;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <title>9:16 text safe zone</title>
      {/* Full-frame red exclusion with a transparent safe-zone hole. */}
      <path
        fill="rgba(220, 38, 38, 0.42)"
        fillRule="evenodd"
        d={`M0,0 H${width} V${height} H0 Z ${hole}`}
      />
      <path
        d={hole}
        fill="none"
        stroke="rgba(255, 255, 255, 0.85)"
        strokeWidth={4}
        vectorEffect="non-scaling-stroke"
      />
      {showRegions && (
        <>
          <rect
            x={primary.x}
            y={primary.y}
            width={primary.width}
            height={primary.height}
            fill="none"
            stroke="rgba(34, 197, 94, 0.9)"
            strokeWidth={3}
            strokeDasharray="16 10"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={lower.x}
            y={lower.y}
            width={lower.width}
            height={lower.height}
            fill="none"
            stroke="rgba(56, 189, 248, 0.95)"
            strokeWidth={3}
            strokeDasharray="12 8"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}
