import { useState, type KeyboardEvent } from 'react';
import type { RegionId } from '../domain/config';

// Front-facing figure. Viewer's left = astronaut's RIGHT side. Regions are discrete and non-overlapping.
const mirror = (d: string) => {
  let isX = true;
  return d.replace(/([MLCQZ])|(-?\d+(\.\d+)?)/g, (m, cmd) => {
    if (cmd) { isX = true; return m; }
    const out = isX ? String(200 - parseFloat(m)) : m;
    isX = !isX;
    return out;
  });
};
const ARM = 'M50 86 C42 87 36 94 34 106 L26 162 C24 182 20 202 16 224 L10 258 C9 266 14 271 20 268 L25 262 L31 226 C35 206 41 188 45 170 L50 128 Z';
const LEG = 'M70 254 L98 254 L97 300 C96 330 95 360 94 390 L93 420 C93 432 96 438 93 444 L73 444 C70 438 74 430 74 420 L72 390 C70 360 67 330 66 300 C65 280 66 266 70 254 Z';
const LUNG = 'M56 86 C62 80 76 78 84 80 L84 166 C76 168 66 168 60 164 C54 140 52 110 56 86 Z';

export const REGION_PATHS: Record<RegionId, string> = {
  head_neurological: 'M100 12 C113 12 122 23 122 37 C122 51 113 60 100 60 C87 60 78 51 78 37 C78 23 87 12 100 12 Z M91 62 L109 62 L109 76 L91 76 Z',
  chest_cardiovascular: 'M88 80 Q100 77 112 80 L113 166 Q100 169 87 166 Z',
  lungs_respiratory: `${LUNG} ${mirror(LUNG)}`,
  abdomen: 'M62 172 L138 172 C140 192 138 212 134 230 L130 250 L70 250 L66 230 C62 212 60 192 62 172 Z',
  right_arm: ARM,
  left_arm: mirror(ARM),
  right_leg: LEG,
  left_leg: mirror(LEG),
};

const SENSORS: { x: number; y: number; label: string }[] = [
  { x: 100, y: 112, label: 'Chest patch' },
  { x: 15, y: 263, label: 'Fingertip oximeter (right)' },
  { x: 177, y: 238, label: 'Wrist band (left)' },
  { x: 160, y: 128, label: 'BP cuff (left upper arm)' },
];

export interface RegionInfo { id: RegionId; label: string; mappedCount: number; attention: boolean }

export function BodyMap({ regions, selected, onSelect, layers = { muscular: false, skeletal: false }, height = 520, interactive = true }: { regions: RegionInfo[]; selected: RegionId | null; onSelect?: (id: RegionId) => void; layers?: { muscular: boolean; skeletal: boolean }; height?: number; interactive?: boolean }) {
  const [hover, setHover] = useState<RegionId | null>(null);
  const [focus, setFocus] = useState<RegionId | null>(null);
  const key = (id: RegionId) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(id); } };
  return (
    <svg viewBox="0 0 200 460" style={{ height, maxWidth: '100%' }} className="mx-auto block" role={interactive ? 'group' : 'img'} aria-label={interactive ? 'Anatomical regions. Use Tab to move between regions and Enter or Space to select.' : 'Anatomical preview'}>
      <defs>
        <radialGradient id="floor" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#D9E2E8" /><stop offset="100%" stopColor="#F4F7FA" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="450" rx="78" ry="9" fill="url(#floor)" />
      {regions.map((r) => {
        const isSel = selected === r.id, isHov = hover === r.id, isFoc = focus === r.id;
        const fill = isSel ? '#1E9E63' : isHov ? '#3F9A6C' : r.mappedCount ? '#6B8577' : '#8A9890';
        return (
          <path
            key={r.id}
            d={REGION_PATHS[r.id]}
            fill={fill}
            stroke={isFoc ? '#17212B' : isSel ? '#0B2E1F' : '#FFFFFF'}
            strokeWidth={isFoc ? 2.2 : isSel ? 1.6 : 1.2}
            strokeDasharray={isFoc && !isSel ? '4 2' : undefined}
            style={{ transition: 'fill 160ms ease-out, stroke 160ms ease-out', cursor: interactive ? 'pointer' : 'default', outline: 'none' }}
            {...(interactive ? {
              role: 'button', tabIndex: 0, 'aria-pressed': isSel,
              'aria-label': `${r.label}: ${r.mappedCount ? `${r.mappedCount} mapped measurement${r.mappedCount > 1 ? 's' : ''}` : 'no mapped sensor data'}${r.attention ? ', data needs attention' : ''}`,
              onClick: () => onSelect?.(r.id), onKeyDown: key(r.id), onMouseEnter: () => setHover(r.id), onMouseLeave: () => setHover(null), onFocus: () => setFocus(r.id), onBlur: () => setFocus(null),
            } : { 'aria-hidden': true })}
          />
        );
      })}
      <g pointerEvents="none" aria-hidden>
        {layers.muscular && (
          <g stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="0.9" fill="none">
            <path d="M64 96 C76 104 86 104 92 96 M136 96 C124 104 114 104 108 96 M70 186 L130 186 M70 204 L130 204 M72 222 L128 222 M100 172 L100 248" />
            <path d="M40 110 C42 130 40 150 36 165 M160 110 C158 130 160 150 164 165 M82 270 C86 310 86 340 84 370 M118 270 C114 310 114 340 116 370" />
          </g>
        )}
        {layers.skeletal && (
          <g stroke="#F7F3E8" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.9">
            <path d="M100 78 L100 250 M66 92 C80 88 90 88 100 90 C110 88 120 88 134 92" />
            {[104, 118, 132, 146].map((y) => <path key={y} d={`M70 ${y} C82 ${y - 6} 92 ${y - 4} 100 ${y} C108 ${y - 4} 118 ${y - 6} 130 ${y}`} />)}
            <path d="M44 96 L34 160 L22 240 M156 96 L166 160 L178 240 M78 258 L82 350 L84 430 M122 258 L118 350 L116 430 M74 244 C88 256 112 256 126 244" />
          </g>
        )}
        {SENSORS.map((s) => (
          <g key={s.label}>
            <circle cx={s.x} cy={s.y} r="4.2" fill="#FFFFFF" stroke="#167A52" strokeWidth="1.6" />
            <circle cx={s.x} cy={s.y} r="1.6" fill="#167A52" />
          </g>
        ))}
        {regions.filter((r) => r.attention).map((r) => {
          const c: Record<RegionId, [number, number]> = { head_neurological: [100, 36], chest_cardiovascular: [100, 140], lungs_respiratory: [70, 124], abdomen: [100, 210], right_arm: [36, 140], left_arm: [164, 160], right_leg: [84, 330], left_leg: [116, 330] };
          const [x, y] = c[r.id];
          return <g key={`att-${r.id}`}><circle cx={x} cy={y} r="6" fill="#FFF4D6" stroke="#6E4900" strokeWidth="1.2" /><text x={x} y={y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#6E4900">!</text></g>;
        })}
      </g>
    </svg>
  );
}
