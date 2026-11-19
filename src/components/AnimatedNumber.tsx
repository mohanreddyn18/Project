import { animate, useMotionValue } from 'motion/react';
import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({ value, suffix = '', className = '' }: AnimatedNumberProps) {
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        setDisplay(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [motionVal, value]);

  return (
    <span className={`tabular-nums ${className}`}>
      {display}
      {suffix}
    </span>
  );
}
