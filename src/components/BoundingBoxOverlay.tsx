import { AnimatePresence, motion } from 'motion/react';
import type { BoundingBoxItem } from '../types/vision';

interface BoundingBoxOverlayProps {
  boxes: BoundingBoxItem[];
  highlightedId?: string | null;
  onSelectBox?: (id: string) => void;
  showLabels?: boolean;
}

const COLOR_STYLES: Record<
  BoundingBoxItem['color'],
  { border: string; labelBg: string; labelText: string; tint: string; activeRing: string }
> = {
  red: {
    border: 'border-red-600',
    labelBg: 'bg-red-600',
    labelText: 'text-white',
    tint: 'bg-red-600/10',
    activeRing: 'ring-2 ring-red-400/80',
  },
  blue: {
    border: 'border-blue-600',
    labelBg: 'bg-blue-600',
    labelText: 'text-white',
    tint: 'bg-blue-600/10',
    activeRing: 'ring-2 ring-blue-400/80',
  },
  emerald: {
    border: 'border-emerald-600',
    labelBg: 'bg-emerald-600',
    labelText: 'text-white',
    tint: 'bg-emerald-600/10',
    activeRing: 'ring-2 ring-emerald-400/80',
  },
  amber: {
    border: 'border-amber-500',
    labelBg: 'bg-amber-500',
    labelText: 'text-slate-950',
    tint: 'bg-amber-500/10',
    activeRing: 'ring-2 ring-amber-300/80',
  },
  slate: {
    border: 'border-slate-300',
    labelBg: 'bg-slate-800',
    labelText: 'text-white',
    tint: 'bg-slate-900/10',
    activeRing: 'ring-2 ring-slate-300/80',
  },
};

export function BoundingBoxOverlay({
  boxes,
  highlightedId,
  onSelectBox,
  showLabels = true,
}: BoundingBoxOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {boxes.map((item, idx) => {
          const [ymin, xmin, ymax, xmax] = item.box_2d;
          const topPct = (ymin / 1000) * 100;
          const leftPct = (xmin / 1000) * 100;
          const heightPct = Math.max(2, ((ymax - ymin) / 1000) * 100);
          const widthPct = Math.max(2, ((xmax - xmin) / 1000) * 100);
          const palette = COLOR_STYLES[item.color];
          const isHighlighted = highlightedId === item.id;
          const isDimmed = Boolean(highlightedId) && !isHighlighted;
          const placeLabelInside = topPct < 7;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{
                opacity: isDimmed ? 0.32 : 1,
                scale: isHighlighted ? 1.015 : 1,
              }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{
                duration: 0.22,
                delay: Math.min(idx * 0.04, 0.28),
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={onSelectBox ? { scale: 1.015 } : undefined}
              onClick={
                onSelectBox
                  ? (e) => {
                      e.stopPropagation();
                      onSelectBox(item.id);
                    }
                  : undefined
              }
              style={{
                top: `${topPct}%`,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
              }}
              className={`absolute border-2 ${palette.border} ${palette.tint} ${
                isHighlighted ? `${palette.activeRing} z-10` : ''
              } ${onSelectBox ? 'pointer-events-auto cursor-pointer' : ''}`}
            >
              {showLabels ? (
                <div
                  className={`absolute left-0 flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] font-semibold leading-tight whitespace-nowrap shadow-sm ${
                    palette.labelBg
                  } ${palette.labelText} ${placeLabelInside ? 'top-0' : '-top-6'}`}
                >
                  <span>{item.label}</span>
                  {item.sublabel ? (
                    <span className="font-mono text-[10px] opacity-90">{item.sublabel}</span>
                  ) : null}
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
