import { AnimatePresence, motion } from 'motion/react';
import { Box, Eye, EyeOff, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import type { BoundingBoxItem } from '../types/vision';
import { BoundingBoxOverlay } from './BoundingBoxOverlay';
import { InteractiveDropZone } from './InteractiveDropZone';
import { ScanBeamOverlay } from './ScanBeamOverlay';
import { SpatialDetectionCanvas3D } from './SpatialDetectionCanvas3D';

interface InspectionViewportProps {
  imageUrl: string | null;
  alt: string;
  boxes: BoundingBoxItem[];
  highlightedId?: string | null;
  onSelectBox?: (id: string) => void;
  onClearHighlight?: () => void;
  onFileDrop: (file: File) => void;
  dropLabel: string;
  loading: boolean;
  scanLabel: string;
  emptyText: string;
  showLabels?: boolean;
  onToggleLabels?: () => void;
}

export function InspectionViewport({
  imageUrl,
  alt,
  boxes,
  highlightedId,
  onSelectBox,
  onClearHighlight,
  onFileDrop,
  dropLabel,
  loading,
  scanLabel,
  emptyText,
  showLabels = true,
  onToggleLabels,
}: InspectionViewportProps) {
  const [zoomed, setZoomed] = useState(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  return (
    <InteractiveDropZone onFileDrop={onFileDrop} acceptPrefix="image/" dropLabel={dropLabel}>
      <div className="surface-3d overflow-hidden rounded-lg bg-slate-950">
        {/* Compact Stage Control Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-950 px-3.5 py-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-mono tabular-nums text-slate-300">
              {boxes.length > 0
                ? `${boxes.length} active overlay${boxes.length === 1 ? '' : 's'}`
                : 'Inspection Viewport'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {imageUrl ? (
              <div className="flex items-center gap-0.5 rounded-md bg-slate-900 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('2d')}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors whitespace-nowrap ${
                    viewMode === '2d'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  <span>2D Overlay</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('3d')}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors whitespace-nowrap ${
                    viewMode === '3d'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Box className="h-3 w-3" />
                  <span>3D Spatial</span>
                </button>
              </div>
            ) : null}

            {boxes.length > 0 && onToggleLabels ? (
              <button
                type="button"
                onClick={onToggleLabels}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white whitespace-nowrap"
              >
                {showLabels ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                <span>{showLabels ? 'Hide Labels' : 'Show Labels'}</span>
              </button>
            ) : null}

            {imageUrl && viewMode === '2d' ? (
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white whitespace-nowrap"
              >
                {zoomed ? <ZoomOut className="h-3 w-3" /> : <ZoomIn className="h-3 w-3" />}
                <span className="font-mono">{zoomed ? '1.0x' : '1.35x'}</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Optical Stage */}
        <AnimatePresence mode="wait">
          {viewMode === '3d' && imageUrl ? (
            <motion.div
              key="3d-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <SpatialDetectionCanvas3D
                imageUrl={imageUrl}
                boxes={boxes}
                highlightedId={highlightedId}
                onSelectBox={onSelectBox}
                onClearHighlight={onClearHighlight}
                showLabels={showLabels}
                loading={loading}
                scanLabel={scanLabel}
              />
            </motion.div>
          ) : (
            <motion.div
              key="2d-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onClearHighlight}
              className={`optical-stage-grid relative flex min-h-[410px] items-center justify-center p-4 ${
                zoomed ? 'overflow-auto' : 'overflow-hidden'
              }`}
            >
              {imageUrl ? (
                <motion.div
                  animate={{ scale: zoomed ? 1.35 : 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                  style={{ transformOrigin: 'center center' }}
                  className="relative inline-block max-w-full"
                >
                  <img
                    src={imageUrl}
                    alt={alt}
                    referrerPolicy="no-referrer"
                    className="block max-h-[450px] w-auto max-w-full rounded-xs shadow-2xl"
                  />
                  <BoundingBoxOverlay
                    boxes={boxes}
                    highlightedId={highlightedId}
                    showLabels={showLabels}
                    onSelectBox={onSelectBox}
                  />
                  <ScanBeamOverlay active={loading} label={scanLabel} />
                </motion.div>
              ) : (
                <p className="text-sm text-slate-400">{emptyText}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </InteractiveDropZone>
  );
}

