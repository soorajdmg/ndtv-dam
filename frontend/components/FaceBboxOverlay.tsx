"use client";

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  confidence?: number;
}

interface FaceBboxOverlayProps {
  bboxes: BBox[];
  imageWidth: number;
  imageHeight: number;
  className?: string;
}

export function FaceBboxOverlay({ bboxes, imageWidth, imageHeight, className }: FaceBboxOverlayProps) {
  if (!bboxes.length) return null;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
    >
      {bboxes.map((bbox, i) => (
        <g key={i}>
          <rect
            x={bbox.x}
            y={bbox.y}
            width={bbox.w}
            height={bbox.h}
            fill="none"
            stroke="#f0a500"
            strokeWidth="3"
            rx="2"
          />
          {bbox.label && (
            <foreignObject x={bbox.x} y={Math.max(0, bbox.y - 22)} width="200" height="22">
              <div
                style={{
                  backgroundColor: "rgba(240,165,0,0.9)",
                  color: "#000",
                  fontSize: "11px",
                  fontWeight: "bold",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "200px",
                }}
              >
                {bbox.label}
                {bbox.confidence !== undefined && ` (${Math.round(bbox.confidence * 100)}%)`}
              </div>
            </foreignObject>
          )}
        </g>
      ))}
    </svg>
  );
}
