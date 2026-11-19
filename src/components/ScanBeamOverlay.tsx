import { AnimatePresence, motion } from 'motion/react';

interface ScanBeamOverlayProps {
  active: boolean;
  label?: string;
}

export function ScanBeamOverlay({ active, label = 'Analyzing frame...' }: ScanBeamOverlayProps) {
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-slate-950/25"
        >
          {/* Animated horizontal scanning laser */}
          <motion.div
            initial={{ top: '-4%' }}
            animate={{ top: ['0%', '98%', '0%'] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-x-0 h-0.5 bg-blue-400 shadow-[0_0_16px_3px_rgba(59,130,246,0.85)]"
          />

          {/* Subtle gradient trail */}
          <motion.div
            initial={{ top: '-12%' }}
            animate={{ top: ['-10%', '88%', '-10%'] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-blue-500/15 to-transparent"
          />

          {/* Corner reticles */}
          <div className="absolute top-3 left-3 h-5 w-5 border-t-2 border-l-2 border-blue-400" />
          <div className="absolute top-3 right-3 h-5 w-5 border-t-2 border-r-2 border-blue-400" />
          <div className="absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-blue-400" />
          <div className="absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-blue-400" />

          {/* Centered status indicator */}
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="rounded-md border border-blue-400/40 bg-slate-950/85 px-3 py-1 font-mono text-xs font-medium text-blue-100 shadow-sm">
              {label}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
