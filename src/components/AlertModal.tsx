import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';

interface AlertModalProps {
  open: boolean;
  title: string;
  message: string;
  details?: string[];
  onClose: () => void;
}

export function AlertModal({ open, title, message, details = [], onClose }: AlertModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="alert-modal-title"
          aria-describedby="alert-modal-desc"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="w-full max-w-md rounded-lg border border-red-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
                  <motion.span
                    animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 rounded-md border border-red-400"
                  />
                  <AlertTriangle className="relative h-5 w-5" />
                </div>
                <h3 id="alert-modal-title" className="text-base font-semibold text-slate-900">
                  {title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Dismiss alert"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <p id="alert-modal-desc" className="text-sm leading-relaxed text-slate-700">
                {message}
              </p>
              {details.length > 0 ? (
                <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {details.map((item, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, delay: 0.06 + idx * 0.04 }}
                      className="flex items-center justify-between font-mono tabular-nums"
                    >
                      <span>{item}</span>
                    </motion.li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 rounded-b-lg">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 whitespace-nowrap"
              >
                Acknowledge Alert
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
