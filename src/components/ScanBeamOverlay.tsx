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
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-slate-950/35 backdrop-blur-[0.5px]"
        >
          {/* Animated horizontal scanning beam */}
          <motion.div
            initial={{ top: '-2%' }}
            animate={{ top: ['0%', '99%', '0%'] }}
            transition={{
              duration: 2.1,
              repeat: Infinity,
              ease: [0.45, 0, 0.55, 1],
            }}
            className="absolute inset-x-0 h-[2px] bg-blue-400 shadow-[0_0_20px_4px_rgba(59,130,246,0.9)]"
          />

          {/* Soft luminous wake trailing the scan line */}
          <motion.div
            initial={{ top: '-14%' }}
            animate={{ top: ['-12%', '87%', '-12%'] }}
            transition={{
              duration: 2.1,
              repeat: Infinity,
              ease: [0.45, 0, 0.55, 1],
            }}
            className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-blue-500/20 to-transparent"
          />

          {/* Animated calibration corner brackets */}
          <motion.div
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-3"
          >
            <div className="absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2 border-blue-400" />
            <div className="absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2 border-blue-400" />
            <div className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-blue-400" />
            <div className="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-blue-400" />
          </motion.div>

          {/* Bottom-centered status banner */}
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 rounded-md border border-blue-400/35 bg-slate-950/90 px-3.5 py-1.5 font-mono text-xs font-medium text-blue-100 shadow-lg"
            >
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-blue-400"
              />
              <span>{label}</span>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
