import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import type { ReactNode } from 'react';

interface TactileCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
}

export function TactileCard({ children, className = '', maxTilt = 3.2 }: TactileCardProps) {
  const prefersReduced = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 280, damping: 26, mass: 0.5 });
  const rotateY = useSpring(rawY, { stiffness: 280, damping: 26, mass: 0.5 });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReduced || e.pointerType === 'touch') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    rawX.set(-ny * maxTilt * 2);
    rawY.set(nx * maxTilt * 2);
  };

  const handlePointerLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <div style={{ perspective: 1000 }}>
      <motion.div
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={
          prefersReduced
            ? undefined
            : {
                rotateX,
                rotateY,
                transformStyle: 'preserve-3d',
              }
        }
        className={`surface-3d rounded-lg ${className}`}
      >
        {children}
      </motion.div>
    </div>
  );
}
