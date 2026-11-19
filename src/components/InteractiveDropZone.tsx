import { AnimatePresence, motion } from 'motion/react';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';

interface InteractiveDropZoneProps {
  onFileDrop: (file: File) => void;
  acceptPrefix: 'image/' | 'video/' | 'audio/';
  dropLabel: string;
  children: ReactNode;
  className?: string;
}

export function InteractiveDropZone({
  onFileDrop,
  acceptPrefix,
  dropLabel,
  children,
  className = '',
}: InteractiveDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith(acceptPrefix) || acceptPrefix === 'image/' && file.name.match(/\.(png|jpe?g|webp|gif)$/i)) {
      onFileDrop(file);
    } else if (acceptPrefix === 'video/' && file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
      onFileDrop(file);
    } else if (acceptPrefix === 'audio/' && file.name.match(/\.(wav|mp3|ogg|webm|m4a)$/i)) {
      onFileDrop(file);
    } else {
      onFileDrop(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative ${className}`}
    >
      {children}
      <AnimatePresence>
        {dragging ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-950/75 text-white backdrop-blur-[1px]"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <Upload className="h-7 w-7 text-blue-300" />
              <span className="text-sm font-semibold">{dropLabel}</span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
