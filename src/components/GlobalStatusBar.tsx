import { AnimatePresence, motion } from 'motion/react';
import { Activity, Camera, ChevronUp, Mic, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { ModuleId } from '../types/vision';
import { AnimatedNumber } from './AnimatedNumber';

interface GlobalStatusBarProps {
  cameraLive: boolean;
  micLive: boolean;
  cameraPermission: PermissionState | 'unsupported' | 'unknown';
  micPermission: PermissionState | 'unsupported' | 'unknown';
  totalDetections: number;
  sessionRuns: number;
  moduleCounts: Record<ModuleId, number>;
  onResetSession: () => void;
}

const MODULE_LABELS: { id: ModuleId; label: string }[] = [
  { id: 'car-color', label: '01. Car Colour' },
  { id: 'animal-detection', label: '02. Animals' },
  { id: 'voice-emotion', label: '03. Voice Emotion' },
  { id: 'nationality', label: '04. Nationality' },
  { id: 'sign-language', label: '05. Sign Language' },
  { id: 'drowsiness', label: '06. Drowsiness' },
];

export function GlobalStatusBar({
  cameraLive,
  micLive,
  cameraPermission,
  micPermission,
  totalDetections,
  sessionRuns,
  moduleCounts,
  onResetSession,
}: GlobalStatusBarProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const cameraLabel = cameraLive
    ? 'Active'
    : cameraPermission === 'denied'
      ? 'Blocked'
      : cameraPermission === 'granted'
        ? 'Ready'
        : 'Idle';

  const micLabel = micLive
    ? 'Recording'
    : micPermission === 'denied'
      ? 'Blocked'
      : micPermission === 'granted'
        ? 'Ready'
        : 'Idle';

  return (
    <footer className="relative z-20 shrink-0 border-t border-slate-200/90 bg-white/95 px-4 py-2.5 shadow-[0_-4px_16px_-8px_rgba(15,23,42,0.08)] lg:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Camera
              className={`h-3.5 w-3.5 shrink-0 ${
                cameraLive
                  ? 'text-emerald-600'
                  : cameraPermission === 'denied'
                    ? 'text-red-600'
                    : 'text-slate-500'
              }`}
            />
            <span className="text-slate-500">Camera:</span>
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                cameraLive
                  ? 'text-emerald-700'
                  : cameraPermission === 'denied'
                    ? 'text-red-700'
                    : 'text-slate-800'
              }`}
            >
              {cameraLive ? (
                <motion.span
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-2 w-2 rounded-full bg-emerald-500"
                />
              ) : null}
              <span>{cameraLabel}</span>
            </span>
          </div>

          <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
            |
          </span>

          <div className="flex items-center gap-2 whitespace-nowrap">
            <Mic
              className={`h-3.5 w-3.5 shrink-0 ${
                micLive
                  ? 'text-red-600'
                  : micPermission === 'denied'
                    ? 'text-red-600'
                    : 'text-slate-500'
              }`}
            />
            <span className="text-slate-500">Microphone:</span>
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                micLive
                  ? 'text-red-700'
                  : micPermission === 'denied'
                    ? 'text-red-700'
                    : 'text-slate-800'
              }`}
            >
              {micLive ? (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-2 w-2 rounded-full bg-red-600"
                />
              ) : null}
              <span>{micLabel}</span>
            </span>
          </div>
        </div>

        <div className="relative flex items-center gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setBreakdownOpen((prev) => !prev)}
            aria-expanded={breakdownOpen}
            className="btn-3d-secondary inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs transition-colors whitespace-nowrap"
          >
            <Activity className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-slate-600">Total Detections:</span>
            <AnimatedNumber
              value={totalDetections}
              className="font-mono font-semibold text-slate-900"
            />
            <span className="hidden text-slate-400 sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden font-mono tabular-nums text-slate-500 sm:inline">
              {sessionRuns} {sessionRuns === 1 ? 'run' : 'runs'}
            </span>
            <ChevronUp
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${
                breakdownOpen ? 'rotate-180' : ''
              }`}
            />
          </motion.button>

          <AnimatePresence>
            {totalDetections > 0 || sessionRuns > 0 ? (
              <motion.button
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={() => {
                  onResetSession();
                  setBreakdownOpen(false);
                }}
                title="Reset session detection counters"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden sm:inline">Reset</span>
              </motion.button>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {breakdownOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                className="surface-3d absolute right-0 bottom-10 z-30 w-64 rounded-lg"
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-slate-900">
                    Session Detections Breakdown
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {sessionRuns} {sessionRuns === 1 ? 'run' : 'runs'}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 px-3.5 py-1.5 text-xs">
                  {MODULE_LABELS.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15, delay: idx * 0.025 }}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        {moduleCounts[item.id]}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </footer>
  );
}
