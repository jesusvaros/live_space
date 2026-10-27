import React, { useId, useMemo, useState } from 'react';
import { K_ANONYMITY, type IntentTrendPoint, type SuppressedCount } from '../api';

// Series colours, checked with the dataviz validator against the dark
// surface: brand accent, blue, ochre. Text never wears them.
export const SERIES = {
  saves: { label: 'Guardados', color: '#ff5b2e' },
  going: { label: 'Van', color: '#5b8def' },
  attended: { label: 'Fueron', color: '#b58a22' },
} as const;

export type SeriesKey = keyof typeof SERIES;

export const formatCount = (value: SuppressedCount) =>
  value === null ? `<${K_ANONYMITY}` : value.toLocaleString('es-ES');

const formatDay = (day: string, withWeekday = false) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', {
    ...(withWeekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
  });

export const Legend: React.FC<{ keys: SeriesKey[] }> = ({ keys }) => (
  <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-white/70">
    {keys.map(key => (
      <li key={key} className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SERIES[key].color }} />
        {SERIES[key].label}
      </li>
    ))}
  </ul>
);

export const StatTile: React.FC<{ label: string; value: SuppressedCount; series?: SeriesKey }> = ({
  label,
  value,
  series,
}) => (
  <div className="min-w-0 rounded-[14px] border border-app-line bg-app-surface p-3">
    <p className={`m-0 font-poster text-[34px] leading-none ${value === null ? 'text-[#8f8b84]' : 'text-app-ink'}`}>
      {formatCount(value)}
    </p>
    <p className="m-0 mt-1 flex items-center gap-1.5 text-xs text-[#c9c5bd]">
      {series ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SERIES[series].color }} /> : null}
      <span className="truncate">{label}</span>
    </p>
  </div>
);

/**
 * Daily trend, one line per series on a shared axis. Hidden buckets (<K)
 * sit on a dashed floor so a gap never reads as zero.
 */
export const TrendChart: React.FC<{
  points: IntentTrendPoint[];
  keys?: Array<'saves' | 'going'>;
  height?: number;
  compact?: boolean;
}> = ({ points, keys = ['saves', 'going'], height = 150, compact = false }) => {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const width = 340;
  const pad = { top: 10, right: 8, bottom: compact ? 6 : 20, left: 8 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = useMemo(() => {
    const values = points.flatMap(point => keys.map(key => point[key] ?? 0));
    return Math.max(K_ANONYMITY * 2, ...values);
  }, [points, keys]);

  if (points.length === 0) return null;

  const x = (index: number) => pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;
  const floorY = y(K_ANONYMITY);

  const pathFor = (key: 'saves' | 'going') => {
    let d = '';
    let drawing = false;
    points.forEach((point, index) => {
      const value = point[key];
      if (value === null) {
        drawing = false;
        return;
      }
      d += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      drawing = true;
    });
    return d;
  };

  const activePoint = active === null ? null : points[active];
  const step = innerW / Math.max(points.length - 1, 1);

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full touch-pan-y"
          role="img"
          aria-labelledby={titleId}
          onPointerLeave={() => setActive(null)}
        >
          <title id={titleId}>
            {`Tendencia de ${points.length} días: ${keys.map(key => SERIES[key].label.toLowerCase()).join(' y ')} por día`}
          </title>
          <rect x={pad.left} y={floorY} width={innerW} height={pad.top + innerH - floorY} fill="rgba(255,255,255,0.04)" />
          <line x1={pad.left} x2={width - pad.right} y1={floorY} y2={floorY} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 4" />
          <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="var(--app-line)" />
          {!compact && (
            <text x={width - pad.right} y={floorY - 4} textAnchor="end" className="fill-white/45 font-mono text-[9px]">
              {`<${K_ANONYMITY} oculto`}
            </text>
          )}
          {activePoint && active !== null && (
            <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} stroke="rgba(255,255,255,0.35)" />
          )}
          {keys.map(key => (
            <path key={key} d={pathFor(key)} fill="none" stroke={SERIES[key].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {keys.map(key =>
            points.map((point, index) => {
              const value = point[key];
              const isActive = index === active;
              if (value === null) {
                return isActive ? (
                  <circle key={`${key}-${index}`} cx={x(index)} cy={floorY} r={4} fill="var(--app-surface)" stroke={SERIES[key].color} strokeWidth={1.5} />
                ) : null;
              }
              const lonely = point[key] !== null && (points[index - 1]?.[key] ?? null) === null && (points[index + 1]?.[key] ?? null) === null;
              return isActive || lonely ? (
                <circle key={`${key}-${index}`} cx={x(index)} cy={y(value)} r={4} fill={SERIES[key].color} stroke="var(--app-surface)" strokeWidth={2} />
              ) : null;
            }),
          )}
          {!compact && (
            <>
              <text x={pad.left} y={height - 4} className="fill-white/45 font-mono text-[9px]">{formatDay(points[0].day)}</text>
              <text x={width - pad.right} y={height - 4} textAnchor="end" className="fill-white/45 font-mono text-[9px]">
                {formatDay(points[points.length - 1].day)}
              </text>
            </>
          )}
          {points.map((point, index) => (
            <rect
              key={point.day}
              x={x(index) - step / 2}
              y={0}
              width={step}
              height={height}
              fill="transparent"
              onPointerEnter={() => setActive(index)}
              onPointerDown={() => setActive(index)}
            />
          ))}
        </svg>
        {activePoint && active !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-xl border border-app-line bg-app-bg/95 px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `${(x(active) / width) * 100}%`,
              transform: `translateX(${active > points.length / 2 ? '-105%' : '5%'})`,
            }}
          >
            <p className="m-0 font-semibold text-app-ink">{formatDay(activePoint.day, true)}</p>
            {keys.map(key => (
              <p key={key} className="m-0 flex items-center gap-1.5 text-white/75">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES[key].color }} />
                {SERIES[key].label}: <span className="text-app-ink">{formatCount(activePoint[key])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
};

/** One horizontal bar; a hidden bucket shows a hatched stub and "<10". */
export const HBar: React.FC<{
  value: SuppressedCount;
  max: number;
  color: string;
  label: string;
}> = ({ value, max, color, label }) => {
  const pct = value === null ? 0 : Math.max(2, (value / Math.max(max, 1)) * 100);
  return (
    <div className="flex items-center gap-2" title={`${label}: ${formatCount(value)}`}>
      <div className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
        {value === null ? (
          <div
            className="absolute inset-y-0 left-0 w-[6%] rounded-full"
            style={{ backgroundImage: `repeating-linear-gradient(135deg, ${color}66 0 2px, transparent 2px 5px)` }}
          />
        ) : (
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
        )}
      </div>
      <span className={`w-10 shrink-0 text-right font-mono text-xs ${value === null ? 'text-white/45' : 'text-app-ink'}`}>
        {formatCount(value)}
      </span>
    </div>
  );
};

export const PrivacyNote: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={`m-0 flex gap-2 text-xs leading-relaxed text-[#8f8b84] ${className}`}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="mt-px shrink-0">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
    <span>
      Solo cifras agregadas. Nunca verás quién es cada persona, y los grupos de menos de {K_ANONYMITY} aparecen como
      «&lt;{K_ANONYMITY}».
    </span>
  </p>
);
