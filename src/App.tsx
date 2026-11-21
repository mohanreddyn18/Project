import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Car,
  EyeOff,
  Globe,
  Hand,
  Menu,
  Mic,
  PawPrint,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { GlobalStatusBar } from './components/GlobalStatusBar';
import { AnimalDetectionModule } from './components/modules/AnimalDetectionModule';
import { CarColorModule } from './components/modules/CarColorModule';
import { DrowsinessModule } from './components/modules/DrowsinessModule';
import { NationalityModule } from './components/modules/NationalityModule';
import { SignLanguageModule } from './components/modules/SignLanguageModule';
import { VoiceEmotionModule } from './components/modules/VoiceEmotionModule';
import type { ModuleId } from './types/vision';

interface NavModule {
  id: ModuleId;
  code: string;
  label: string;
  shortDesc: string;
  icon: ComponentType<{ className?: string }>;
}

const MODULES: NavModule[] = [
  {
    id: 'car-color',
    code: '01',
    label: 'Car Colour Detection',
    shortDesc: 'Traffic signal cars & pedestrians',
    icon: Car,
  },
  {
    id: 'animal-detection',
    code: '02',
    label: 'Animal Detection',
    shortDesc: 'Species & carnivore alerts',
    icon: PawPrint,
  },
  {
    id: 'voice-emotion',
    code: '03',
    label: 'Voice Emotion',
    shortDesc: 'Female voice emotion analysis',
    icon: Mic,
  },
  {
    id: 'nationality',
    code: '04',
    label: 'Nationality Detection',
    shortDesc: 'Conditional demographic traits',
    icon: Globe,
  },
  {
    id: 'sign-language',
    code: '05',
    label: 'Sign Language',
    shortDesc: '6 PM – 10 PM gesture feed',
    icon: Hand,
  },
  {
    id: 'drowsiness',
    code: '06',
    label: 'Drowsiness Detection',
    shortDesc: 'Vehicle sleep & age alert',
    icon: EyeOff,
  },
];

const INITIAL_MODULE_COUNTS: Record<ModuleId, number> = {
  'car-color': 0,
  'animal-detection': 0,
  'voice-emotion': 0,
  nationality: 0,
  'sign-language': 0,
  drowsiness: 0,
};

type DevicePermission = PermissionState | 'unsupported' | 'unknown';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('car-color');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [cameraLive, setCameraLive] = useState(false);
  const [micLive, setMicLive] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<DevicePermission>('unknown');
  const [micPermission, setMicPermission] = useState<DevicePermission>('unknown');

  const [moduleCounts, setModuleCounts] = useState<Record<ModuleId, number>>(INITIAL_MODULE_COUNTS);
  const [sessionRuns, setSessionRuns] = useState(0);
  const [shortcutHud, setShortcutHud] = useState<{ label: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    const cleanups: (() => void)[] = [];

    async function watchPermission(
      name: PermissionName,
      setter: (state: DevicePermission) => void,
    ) {
      if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
        if (active) setter('unsupported');
        return;
      }
      try {
        const status = await navigator.permissions.query({ name });
        if (!active) return;
        setter(status.state);
        const onChange = () => {
          if (active) setter(status.state);
        };
        status.addEventListener('change', onChange);
        cleanups.push(() => status.removeEventListener('change', onChange));
      } catch {
        if (active) setter('unsupported');
      }
    }

    void watchPermission('camera' as PermissionName, setCameraPermission);
    void watchPermission('microphone' as PermissionName, setMicPermission);

    return () => {
      active = false;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const recordDetection = useCallback((moduleId: ModuleId, count: number) => {
    setSessionRuns((r) => r + 1);
    if (count > 0) {
      setModuleCounts((prev) => ({
        ...prev,
        [moduleId]: prev[moduleId] + count,
      }));
    }
  }, []);

  const handleCameraStateChange = useCallback(
    (active: boolean, permission?: 'granted' | 'denied') => {
      setCameraLive(active);
      if (permission) setCameraPermission(permission);
    },
    [],
  );

  const handleMicStateChange = useCallback(
    (active: boolean, permission?: 'granted' | 'denied') => {
      setMicLive(active);
      if (permission) setMicPermission(permission);
    },
    [],
  );

  const handleResetSession = useCallback(() => {
    setModuleCounts(INITIAL_MODULE_COUNTS);
    setSessionRuns(0);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          (target.tagName === 'INPUT' &&
            !['checkbox', 'radio', 'file', 'button', 'submit'].includes(
              (target as HTMLInputElement).type,
            )));
      if (isTextInput) return;

      if ((e.ctrlKey || e.altKey) && !e.shiftKey && !e.metaKey) {
        const digit = Number(e.key);
        if (Number.isInteger(digit) && digit >= 1 && digit <= MODULES.length) {
          e.preventDefault();
          const targetMod = MODULES[digit - 1];
          setActiveModule(targetMod.id);
          setMobileMenuOpen(false);
          setShortcutHud({
            label: `${targetMod.code}. ${targetMod.label}`,
            key: e.altKey ? `Alt+${digit}` : `Ctrl+${digit}`,
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!shortcutHud) return;
    const timer = window.setTimeout(() => setShortcutHud(null), 1500);
    return () => window.clearTimeout(timer);
  }, [shortcutHud]);

  const totalDetections = Object.values(moduleCounts).reduce((sum, n) => sum + n, 0);
  const currentModule = MODULES.find((m) => m.id === activeModule) ?? MODULES[0];

  const renderModule = () => {
    switch (activeModule) {
      case 'car-color':
        return <CarColorModule onDetectionRecorded={(c) => recordDetection('car-color', c)} />;
      case 'animal-detection':
        return (
          <AnimalDetectionModule
            onDetectionRecorded={(c) => recordDetection('animal-detection', c)}
          />
        );
      case 'voice-emotion':
        return (
          <VoiceEmotionModule
            onMicStateChange={handleMicStateChange}
            onDetectionRecorded={(c) => recordDetection('voice-emotion', c)}
          />
        );
      case 'nationality':
        return <NationalityModule onDetectionRecorded={(c) => recordDetection('nationality', c)} />;
      case 'sign-language':
        return (
          <SignLanguageModule
            onCameraStateChange={handleCameraStateChange}
            onDetectionRecorded={(c) => recordDetection('sign-language', c)}
          />
        );
      case 'drowsiness':
        return <DrowsinessModule onDetectionRecorded={(c) => recordDetection('drowsiness', c)} />;
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="studio-canvas-bg flex min-h-screen text-slate-900">
        {/* Desktop Obsidian 3D Architectural Rail */}
        <aside className="sidebar-obsidian-3d hidden w-64 shrink-0 flex-col text-slate-200 lg:flex">
          <div className="flex h-14 items-center border-b border-slate-800/80 px-5">
            <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
              Sightline Vision Suite
            </span>
          </div>

          <nav className="flex-1 space-y-1.5 p-3" aria-label="Detection Models">
            {MODULES.map((mod, index) => {
              const Icon = mod.icon;
              const isActive = mod.id === activeModule;
              const modCount = moduleCounts[mod.id];
              const shortcut = `Ctrl+${index + 1}`;
              return (
                <motion.button
                  key={mod.id}
                  type="button"
                  whileHover={isActive ? undefined : { x: 2 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.14 }}
                  onClick={() => setActiveModule(mod.id)}
                  title={`${mod.label} (${shortcut} or Alt+${index + 1})`}
                  className={`relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="sidebar-active-bg"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-lg border border-blue-400/35 bg-gradient-to-b from-blue-500/25 to-blue-600/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_6px_16px_-4px_rgba(0,0,0,0.45)]"
                    />
                  ) : null}
                  <Icon
                    className={`relative z-10 mt-0.5 h-4 w-4 shrink-0 ${
                      isActive ? 'text-blue-300' : 'text-slate-400'
                    }`}
                  />
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">
                        {mod.code}. {mod.label}
                      </span>
                      <span
                        className={`font-mono text-[10px] tabular-nums shrink-0 ${
                          isActive ? 'text-blue-200' : 'text-slate-500'
                        }`}
                      >
                        {modCount > 0 ? `${modCount} · ${shortcut}` : shortcut}
                      </span>
                    </div>
                    <div
                      className={`mt-0.5 truncate text-[11px] ${
                        isActive ? 'text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      {mod.shortDesc}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </nav>

          <div className="border-t border-slate-800/80 px-4 py-3 text-[11px] text-slate-400">
            Shortcuts: <span className="font-mono text-slate-200">Ctrl+1–6</span> (or{' '}
            <span className="font-mono text-slate-200">Alt+1–6</span>)
          </div>
        </aside>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileMenuOpen ? (
            <div className="fixed inset-0 z-40 flex lg:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="fixed inset-0 bg-slate-950/50"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                className="relative z-50 flex w-72 flex-col bg-white shadow-xl"
              >
                <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
                  <span className="font-display text-sm font-bold text-slate-900">
                    Sightline Vision Suite
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Close navigation"
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <nav className="flex-1 space-y-1 p-3">
                  {MODULES.map((mod) => {
                    const Icon = mod.icon;
                    const isActive = mod.id === activeModule;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => {
                          setActiveModule(mod.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs font-medium ${
                          isActive
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>
                          {mod.code}. {mod.label}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </motion.aside>
            </div>
          ) : null}
        </AnimatePresence>

        {/* Main Content Shell */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200/90 bg-white/95 px-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] lg:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open module menu"
                className="btn-3d-secondary rounded-md p-2 text-slate-600 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 truncate text-xs text-slate-500">
                <span className="font-medium text-slate-700">Sightline</span>
                <span aria-hidden="true">/</span>
                <span className="truncate font-semibold text-slate-900">
                  {currentModule.code}. {currentModule.label}
                </span>
              </div>
            </div>

            <div className="surface-3d-recessed hidden items-center gap-1 rounded-lg p-1 sm:flex">
              {MODULES.map((mod, index) => {
                const isActive = mod.id === activeModule;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setActiveModule(mod.id)}
                    title={`${mod.label} (Ctrl+${index + 1} / Alt+${index + 1})`}
                    className={`relative rounded-md px-2.5 py-1 text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="topbar-active-tab"
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                        className="absolute inset-0 rounded-md bg-gradient-to-b from-slate-800 to-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]"
                      />
                    ) : null}
                    <span className="relative z-10">{mod.code}</span>
                  </button>
                );
              })}
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, y: 8, scale: 0.994 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.996 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {renderModule()}
              </motion.div>
            </AnimatePresence>
          </main>

          <GlobalStatusBar
            cameraLive={cameraLive}
            micLive={micLive}
            cameraPermission={cameraPermission}
            micPermission={micPermission}
            totalDetections={totalDetections}
            sessionRuns={sessionRuns}
            moduleCounts={moduleCounts}
            onResetSession={handleResetSession}
          />
        </div>

        {/* Keyboard Shortcut Feedback HUD */}
        <AnimatePresence>
          {shortcutHud ? (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              className="pointer-events-none fixed bottom-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white shadow-xl"
            >
              <span className="font-mono text-[11px] text-blue-300">{shortcutHud.key}</span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-medium whitespace-nowrap">{shortcutHud.label}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
