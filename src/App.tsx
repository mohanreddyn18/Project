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
import { useState } from 'react';
import type { ComponentType } from 'react';
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

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('car-color');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentModule = MODULES.find((m) => m.id === activeModule) ?? MODULES[0];

  const renderModule = () => {
    switch (activeModule) {
      case 'car-color':
        return <CarColorModule />;
      case 'animal-detection':
        return <AnimalDetectionModule />;
      case 'voice-emotion':
        return <VoiceEmotionModule />;
      case 'nationality':
        return <NationalityModule />;
      case 'sign-language':
        return <SignLanguageModule />;
      case 'drowsiness':
        return <DrowsinessModule />;
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
        {/* Desktop Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="flex h-14 items-center border-b border-slate-200 px-5">
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Sightline Vision Suite
            </span>
          </div>

          <nav className="flex-1 space-y-1 p-3" aria-label="Detection Models">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              const isActive = mod.id === activeModule;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveModule(mod.id)}
                  className={`relative flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="sidebar-active-bg"
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      className="absolute inset-0 rounded-md bg-slate-900"
                    />
                  ) : null}
                  <Icon
                    className={`relative z-10 mt-0.5 h-4 w-4 shrink-0 ${
                      isActive ? 'text-blue-400' : 'text-slate-400'
                    }`}
                  />
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">
                      {mod.code}. {mod.label}
                    </div>
                    <div
                      className={`mt-0.5 truncate text-[11px] ${
                        isActive ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {mod.shortDesc}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 px-4 py-3 text-[11px] text-slate-500">
            6 Visual &amp; Audio Models · Integrated Console
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
          <header className="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open module menu"
                className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
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

            <div className="hidden items-center gap-1 sm:flex">
              {MODULES.map((mod) => {
                const isActive = mod.id === activeModule;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setActiveModule(mod.id)}
                    title={mod.label}
                    className={`relative rounded-md px-2.5 py-1 text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="topbar-active-tab"
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                        className="absolute inset-0 rounded-md bg-slate-900"
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
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {renderModule()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
