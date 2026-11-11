import { useState } from 'react';
import type { Point } from '../core/types';
import { pointByBearing } from '../core/snapping';

export function PrecisionEntry({
  anchor,
  elevation,
  unit,
  onPlace,
}: {
  anchor: Point | null;
  elevation: number;
  unit: string;
  onPlace: (point: Point) => void;
}) {
  const [mode, setMode] = useState<'coordinates' | 'bearing'>('coordinates');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [bearing, setBearing] = useState('');
  const [distance, setDistance] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="vertex-details precision-entry">
      <summary>Precise placement</summary>
      <div>
        <div className="shape-mode">
          <div>
            <button
              type="button"
              aria-pressed={mode === 'coordinates'}
              className={mode === 'coordinates' ? 'active' : ''}
              onClick={() => {
                setMode('coordinates');
                setError(null);
              }}
            >
              Coordinates
            </button>
            <button
              type="button"
              aria-pressed={mode === 'bearing'}
              className={mode === 'bearing' ? 'active' : ''}
              onClick={() => {
                setMode('bearing');
                setError(null);
              }}
            >
              Bearing / distance
            </button>
          </div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            try {
              let point: Point;
              if (mode === 'coordinates') {
                if (!x.trim() || !y.trim()) throw new Error('Enter both X and Y.');
                point = { x: Number(x), y: Number(y), z: elevation };
                if (
                  Object.values(point).some(
                    (value) => !Number.isFinite(value) || Math.abs(value) > 1e12,
                  )
                )
                  throw new Error('Enter finite coordinates within the supported range.');
              } else {
                if (!anchor)
                  throw new Error('Place a start point before using bearing and distance.');
                if (!bearing.trim() || !distance.trim())
                  throw new Error('Enter a bearing and distance.');
                point = pointByBearing(anchor, Number(bearing), Number(distance), elevation);
              }
              setError(null);
              onPlace(point);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'The point could not be placed.');
            }
          }}
        >
          {mode === 'coordinates' ? (
            <>
              <label className="numeric-field">
                <span>Easting X</span>
                <input
                  aria-label="Placement X"
                  type="number"
                  step="any"
                  value={x}
                  onChange={(event) => setX(event.target.value)}
                />
              </label>
              <label className="numeric-field">
                <span>Northing Y</span>
                <input
                  aria-label="Placement Y"
                  type="number"
                  step="any"
                  value={y}
                  onChange={(event) => setY(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <p className="curve-note">
                {anchor ? `From X ${anchor.x}, Y ${anchor.y}.` : 'Place a start point first.'}{' '}
                Bearing is clockwise from north.
              </p>
              <label className="numeric-field">
                <span>Bearing · degrees</span>
                <input
                  aria-label="Placement bearing"
                  type="number"
                  step="any"
                  min="0"
                  max="360"
                  value={bearing}
                  onChange={(event) => setBearing(event.target.value)}
                />
              </label>
              <label className="numeric-field">
                <span>Horizontal distance · {unit}</span>
                <input
                  aria-label="Placement distance"
                  type="number"
                  step="any"
                  min="0"
                  value={distance}
                  onChange={(event) => setDistance(event.target.value)}
                />
              </label>
            </>
          )}
          <p className="curve-note">
            Z = {elevation} {unit}. Exact entry bypasses grid and object snaps.
          </p>
          {error && (
            <p className="curve-edit-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="precision-place"
            type="submit"
            disabled={mode === 'bearing' && !anchor}
          >
            Place point
          </button>
        </form>
      </div>
    </details>
  );
}
