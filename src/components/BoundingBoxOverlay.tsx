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
  {
    border: string;
    corner: string;
    labelBg: string;
    labelText: string;
    tint: string;
    activeRing: string;
  }
> = {
  red: {
    border: 'border-red-500/85',
    corner: 'border-red-400',
    labelBg: 'bg-red-600',
    labelText: 'text-white',
    tint: 'bg-red-600/12',
    activeRing: 'ring-2 ring-red-400/90 shadow-[0_0_0_1px_rgba(248,113,113,0.4)]',
  },
  blue: {
    border: 'border-blue-500/85',
    corner: 'border-blue-400',
    labelBg: 'bg-blue-600',
    labelText: 'text-white',
    tint: 'bg-blue-600/12',
    activeRing: 'ring-2 ring-blue-400/90 shadow-[0_0_0_1px_rgba(96,165,250,0.4)]',
  },
  emerald: {
    border: 'border-emerald-500/85',
    corner: 'border-emerald-400',
    labelBg: 'bg-emerald-600',
    labelText: 'text-white',
    tint: 'bg-emerald-600/12',
    activeRing: 'ring-2 ring-emerald-400/90 shadow-[0_0_0_1px_rgba(52,211,153,0.4)]',
  },
  amber: {
    border: 'border-amber-400/90',
    corner: 'border-amber-300',
    labelBg: 'bg-amber-400',
    labelText: 'text-slate-950',
    tint: 'bg-amber-500/12',
    activeRing: 'ring-2 ring-amber-300/90 shadow-[0_0_0_1px_rgba(252,211,77,0.4)]',
  },
  slate: {
    border: 'border-slate-300/85',
    corner: 'border-slate-200',
    labelBg: 'bg-slate-800',
    labelText: 'text-white',
    tint: 'bg-slate-900/12',
    activeRing: 'ring-2 ring-slate-300/90',
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
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{
                opacity: isDimmed ? 0.26 : 1,
                scale: isHighlighted ? 1.018 : 1,
              }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{
                type: 'spring',
                stiffness: 460,
                damping: 32,
                delay: Math.min(idx * 0.045, 0.3),
              }}
              whileHover={onSelectBox ? { scale: 1.018 } : undefined}
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
              {/* Optical corner accent ticks when focused */}
              {isHighlighted ? (
                <>
                  <span
                    className={`absolute -top-1 -left-1 h-2.5 w-2.5 border-t-2 border-l-2 ${palette.corner}`}
                  />
                  <span
                    className={`absolute -top-1 -right-1 h-2.5 w-2.5 border-t-2 border-r-2 ${palette.corner}`}
                  />
                  <span
                    className={`absolute -bottom-1 -left-1 h-2.5 w-2.5 border-b-2 border-l-2 ${palette.corner}`}
                  />
                  <span
                    className={`absolute -bottom-1 -right-1 h-2.5 w-2.5 border-b-2 border-r-2 ${palette.corner}`}
                  />
                </>
              ) : null}

              {showLabels ? (
                <motion.div
                  initial={{ opacity: 0, y: placeLabelInside ? -2 : 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(idx * 0.045 + 0.06, 0.36) }}
                  className={`absolute left-0 flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] font-semibold leading-tight whitespace-nowrap shadow-sm ${
                    palette.labelBg
                  } ${palette.labelText} ${placeLabelInside ? 'top-0' : '-top-6'}`}
                >
                  <span>{item.label}</span>
                  {item.sublabel ? (
                    <span className="font-mono text-[10px] opacity-90">{item.sublabel}</span>
                  ) : null}
                </motion.div>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
