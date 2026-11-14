import type { Point } from '../core/types';
import type { GradeOverlay } from '../core/grade';
import { gradePercent, measureGrade } from '../core/grade';

export function GradeOverlayGraphic({
  overlay,
  screen,
}: {
  overlay: GradeOverlay;
  screen: (point: Point) => { x: number; y: number };
}) {
  const a = screen(overlay.a),
    b = overlay.b ? screen(overlay.b) : null;
  const measurement = overlay.b ? measureGrade(overlay.a, overlay.b) : null;
  const from = measurement?.downhill === 'b-to-a' ? b : a,
    to = measurement?.downhill === 'b-to-a' ? a : b;
  const color = overlay.preview ? '#b96d28' : '#276c72';
  return (
    <g
      data-testid="grade-overlay"
      pointerEvents="none"
      data-preview={overlay.preview ? 'true' : 'false'}
    >
      <defs>
        <marker
          id="grade-downhill-marker"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill={color} />
        </marker>
      </defs>
      {b && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeDasharray="5 4"
          strokeWidth="1.5"
        />
      )}
      {measurement?.downhill && from && to && (
        <line
          data-testid="grade-downhill-arrow"
          data-direction={measurement.downhill}
          x1={from.x * 0.7 + to.x * 0.3}
          y1={from.y * 0.7 + to.y * 0.3}
          x2={from.x * 0.3 + to.x * 0.7}
          y2={from.y * 0.3 + to.y * 0.7}
          stroke={color}
          strokeWidth="2"
          markerEnd="url(#grade-downhill-marker)"
        />
      )}
      <circle cx={a.x} cy={a.y} r="7" fill="#fffdf4" stroke={color} strokeWidth="2" />
      <text x={a.x - 13} y={a.y - 12} className="grade-plan-label" fill={color}>
        A
      </text>
      {b && (
        <>
          <circle cx={b.x} cy={b.y} r="7" fill="#fffdf4" stroke={color} strokeWidth="2" />
          <text x={b.x + 12} y={b.y + 17} className="grade-plan-label" fill={color}>
            B
          </text>
        </>
      )}
      {b && measurement && (
        <text
          data-testid="grade-plan-label"
          x={(a.x + b.x) / 2 + 10}
          y={(a.y + b.y) / 2 - 12}
          className="grade-plan-label"
          fill={color}
        >
          {overlay.preview ? 'Preview · ' : ''}A→B {gradePercent(measurement)}
        </text>
      )}
    </g>
  );
}
