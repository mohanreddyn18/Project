import { AnimatePresence, motion } from 'motion/react';
import { Camera, Check, Clock, Eye, EyeOff, Hand, Image as ImageIcon, Loader2, RotateCcw, Sparkles, Upload, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BoundingBoxItem, SignLanguageResult } from '../../types/vision';
import { captureVideoFrame, fileToBase64, urlToBase64 } from '../../utils/media';
import { AnimatedNumber } from '../AnimatedNumber';
import { BoundingBoxOverlay } from '../BoundingBoxOverlay';
import { InspectionViewport } from '../InspectionViewport';
import { ScanBeamOverlay } from '../ScanBeamOverlay';
import { TactileCard } from '../TactileCard';

const SAMPLE_SIGN_IMAGE = '/src/assets/images/sample_sign_language_1795104911353.jpg';
const TARGET_WORDS = [
  'Hello',
  'Thank You',
  'Yes',
  'No',
  'Please',
  'Sorry',
  'Help',
  'I Love You',
  'Stop',
  'Good',
];

interface TranscriptEntry {
  id: string;
  word: string;
  confidence: number;
  time: string;
}

interface SignLanguageModuleProps {
  onCameraStateChange?: (active: boolean, permission?: 'granted' | 'denied') => void;
  onDetectionRecorded?: (count: number) => void;
}

export function SignLanguageModule({
  onCameraStateChange,
  onDetectionRecorded,
}: SignLanguageModuleProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoIntervalRef = useRef<number | null>(null);

  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(SAMPLE_SIGN_IMAGE);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(
    null,
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [simulateActiveWindow, setSimulateActiveWindow] = useState(false);
  const [result, setResult] = useState<SignLanguageResult | null>(null);
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const currentHour = now.getHours();
  const isNaturallyOperational = currentHour >= 18 && currentHour < 22;
  const isOperational = isNaturallyOperational || simulateActiveWindow;
  const realTimePercent = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  const effectiveTimePercent =
    !isNaturallyOperational && simulateActiveWindow ? (20 / 24) * 100 : realTimePercent;

  useEffect(() => {
    if (!autoDetect || !cameraActive || !isOperational) {
      if (autoIntervalRef.current !== null) {
        window.clearInterval(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
      return;
    }

    autoIntervalRef.current = window.setInterval(() => {
      if (!loading) {
        void handleCaptureCameraFrame();
      }
    }, 3500);

    return () => {
      if (autoIntervalRef.current !== null) {
        window.clearInterval(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
    };
  }, [autoDetect, cameraActive, isOperational, loading]);

  const stopCamera = () => {
    setAutoDetect(false);
    if (autoIntervalRef.current !== null) {
      window.clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    onCameraStateChange?.(false);
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      onCameraStateChange?.(true, 'granted');
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      onCameraStateChange?.(false, 'denied');
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to access webcam. Check camera permissions or switch to Image Upload mode.',
      );
    }
  };

  const runSignInference = async (base64: string, mimeType: string) => {
    if (!isOperational) {
      setError('Sign Language Detection is operational only between 6:00 PM and 10:00 PM.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze/sign-language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          clientHour: now.getHours(),
          overrideWindow: simulateActiveWindow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sign language recognition failed.');
      }
      const typed = data as SignLanguageResult;
      setResult(typed);
      onDetectionRecorded?.(typed.handDetected ? 1 : 0);
      if (typed.handDetected && typed.recognizedWord) {
        setHistory((prev) => [
          {
            id: `${Date.now()}-${Math.random()}`,
            word: typed.recognizedWord,
            confidence: typed.confidence,
            time: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          },
          ...prev.slice(0, 11),
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign language detection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeImage = async () => {
    if (!previewUrl) return;
    let payload = imagePayload;
    if (!payload) {
      const loaded = await urlToBase64(previewUrl);
      payload = { base64: loaded.base64, mimeType: loaded.mimeType };
      setImagePayload(payload);
    }
    await runSignInference(payload.base64, payload.mimeType);
  };

  const handleCaptureCameraFrame = async () => {
    if (!videoRef.current || !cameraActive) return;
    const captured = captureVideoFrame(videoRef.current);
    await runSignInference(captured.base64, captured.mimeType);
  };

  const handleImageFile = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const converted = await fileToBase64(file);
      setPreviewUrl(converted.dataUrl);
      setImagePayload({ base64: converted.base64, mimeType: converted.mimeType });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load image.');
    }
  };

  const boxes: BoundingBoxItem[] =
    result && result.handDetected && result.box_2d
      ? [
          {
            id: 'sign-hand',
            label: result.recognizedWord,
            sublabel: `${Math.round(result.confidence * 100)}%`,
            color: 'blue',
            box_2d: result.box_2d,
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            05. Sign Language Detection
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Recognizes sign language gestures and known vocabulary via uploaded images or real-time
            webcam video. Operational strictly from 6:00 PM to 10:00 PM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'image', label: 'Upload Image', Icon: ImageIcon },
                { id: 'video', label: 'Real-Time Video', Icon: Video },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === 'image') stopCamera();
                  setMode(id);
                  setError(null);
                }}
                className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === id ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === id ? (
                  <motion.span
                    layoutId="sign-mode-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 rounded-md bg-white shadow-xs"
                  />
                ) : null}
                <Icon className="relative z-10 h-3.5 w-3.5" />
                <span className="relative z-10">{label}</span>
              </button>
            ))}
          </div>

          {mode === 'image' ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                  e.target.value = '';
                }}
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setPreviewUrl(SAMPLE_SIGN_IMAGE);
                  setImagePayload(null);
                  setResult(null);
                  setError(null);
                }}
                className="btn-3d-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Sample Sign
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                className="btn-3d-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Image
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleAnalyzeImage}
                disabled={loading || !previewUrl || !isOperational}
                className="btn-3d-primary inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {loading ? 'Recognizing...' : 'Detect Sign'}
              </motion.button>
            </>
          ) : null}
        </div>
      </div>

      <motion.div
        layout
        className={`space-y-3 rounded-lg border px-4 py-3 text-xs transition-colors ${
          isOperational
            ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
            : 'border-amber-200 bg-amber-50/90 text-amber-950'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="font-semibold">
              {isOperational ? 'Model Operational' : 'Outside Operational Hours (Locked)'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Local Time: {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span aria-hidden="true">·</span>
            <span>Allowed Window: 6:00 PM – 10:00 PM (18:00–22:00)</span>
          </div>

          {!isNaturallyOperational ? (
            <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={simulateActiveWindow}
                onChange={(e) => {
                  setSimulateActiveWindow(e.target.checked);
                  setError(null);
                }}
                className="rounded border-amber-400 text-blue-600"
              />
              Simulate 6:00 PM – 10:00 PM Window (Testing)
            </label>
          ) : null}
        </div>

        {/* 24-Hour Operational Window Timeline */}
        <div className="space-y-1">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-900/10">
            {/* Active 18:00 - 22:00 Permit Zone */}
            <div
              style={{ left: '75%', width: '16.6667%' }}
              className={`absolute inset-y-0 rounded-full transition-colors ${
                isOperational ? 'bg-emerald-500/45' : 'bg-blue-500/30'
              }`}
            />
            {/* Real-time ghost reference when simulated */}
            {!isNaturallyOperational && simulateActiveWindow ? (
              <div
                style={{ left: `${realTimePercent}%` }}
                className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-slate-500/45"
                title="Actual local time"
              />
            ) : null}
            {/* Active time indicator */}
            <motion.div
              animate={{ left: `${effectiveTimePercent}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className={`absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-full ${
                isOperational ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] tabular-nums opacity-75">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span className="font-semibold">18:00–22:00 Active</span>
            <span>24:00</span>
          </div>
        </div>
      </motion.div>

      {error ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </motion.div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <AnimatePresence mode="wait">
            {mode === 'image' ? (
              <motion.div
                key="sign-image-mode"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                <InspectionViewport
                  imageUrl={previewUrl}
                  alt="Sign language preview"
                  boxes={boxes}
                  onFileDrop={handleImageFile}
                  dropLabel="Drop sign gesture image to recognize"
                  loading={loading}
                  scanLabel="Recognizing hand gesture..."
                  emptyText="Drag and drop or upload a hand gesture photo to recognize."
                  showLabels={showLabels}
                  onToggleLabels={() => setShowLabels((v) => !v)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="sign-video-mode"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="space-y-3"
              >
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                  <div className="flex items-center justify-between border-b border-slate-800/90 bg-slate-950 px-3.5 py-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2 font-mono">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          cameraActive ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'
                        }`}
                      />
                      <span>
                        {cameraActive ? 'Live Webcam Feed · Active' : 'Real-Time Webcam Standby'}
                      </span>
                    </div>
                    {boxes.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowLabels((v) => !v)}
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white whitespace-nowrap"
                      >
                        {showLabels ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        <span>{showLabels ? 'Hide Labels' : 'Show Labels'}</span>
                      </button>
                    ) : null}
                  </div>
                  <div className="optical-stage-grid relative flex min-h-[380px] items-center justify-center overflow-hidden p-3">
                    {cameraActive ? (
                      <div className="relative inline-block w-full">
                        <video
                          ref={videoRef}
                          muted
                          playsInline
                          className="mx-auto max-h-[440px] w-full rounded-xs object-contain"
                        />
                        <BoundingBoxOverlay boxes={boxes} showLabels={showLabels} />
                        <ScanBeamOverlay active={loading} label="Analyzing live frame..." />
                      </div>
                    ) : (
                      <div className="px-6 py-12 text-center text-slate-300">
                        <Camera className="mx-auto h-8 w-8 text-slate-500" />
                        <p className="mt-3 text-sm font-medium text-white">
                          Real-Time Sign Language Webcam Feed
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Start your webcam to capture live frames or enable continuous 3.5s
                          detection.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  {!cameraActive ? (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={startCamera}
                      disabled={!isOperational}
                      className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Start Webcam
                    </motion.button>
                  ) : (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={stopCamera}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
                    >
                      <VideoOff className="h-3.5 w-3.5 text-red-600" />
                      Stop Webcam
                    </motion.button>
                  )}

                  {cameraActive ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={autoDetect}
                        disabled={!isOperational}
                        onChange={(e) => setAutoDetect(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      Auto-recognize every 3.5s
                    </label>
                  ) : null}
                </div>

                {cameraActive ? (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCaptureCameraFrame}
                    disabled={loading || !isOperational}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Capture &amp; Recognize
                  </motion.button>
                ) : null}
              </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <TactileCard>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Recognized Sign Output</h3>
            </div>

            {!isOperational ? (
              <div className="p-5 text-xs leading-relaxed text-amber-800">
                Sign Language Detection is currently inactive. Operational hours are{' '}
                <strong className="font-semibold">6:00 PM to 10:00 PM</strong>. Enable the window
                simulator toggle above to test during off-hours.
              </div>
            ) : !result ? (
              <div className="px-4 py-8 text-center">
                <Hand className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-xs text-slate-500">
                  Submit an image or capture a live webcam frame to recognize the signed word.
                </p>
              </div>
            ) : (
              <motion.div
                key={result.recognizedWord}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="divide-y divide-slate-100"
              >
                <div className="p-4">
                  <div className="text-xs text-slate-500">Recognized Word / Sign</div>
                  <div className="mt-1 text-2xl font-semibold text-blue-600">
                    {result.handDetected ? result.recognizedWord : 'No Gesture Detected'}
                  </div>
                </div>
                <div className="space-y-2 px-4 py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Confidence</span>
                    <span className="font-mono font-semibold text-slate-900">
                      <AnimatedNumber value={Math.round(result.confidence * 100)} suffix="%" />
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: Math.min(1, Math.max(0.05, result.confidence)) }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      style={{ transformOrigin: 'left' }}
                      className="h-full w-full bg-blue-600"
                    />
                  </div>
                </div>
                <div className="p-4 text-xs leading-relaxed text-slate-600">
                  {result.gestureDescription}
                </div>
                {result.alternativeMatches.length > 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-600">
                    <span className="font-medium text-slate-800">Close matches: </span>
                    {result.alternativeMatches.join(' · ')}
                  </div>
                ) : null}
              </motion.div>
            )}
          </TactileCard>

          <div className="surface-3d rounded-lg p-4">
            <h4 className="text-xs font-semibold text-slate-900">Supported Known Words</h4>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs">
              {TARGET_WORDS.map((word) => {
                const matched = Boolean(
                  result?.handDetected &&
                    result.recognizedWord.toLowerCase().includes(word.toLowerCase()),
                );
                return (
                  <motion.div
                    key={word}
                    animate={matched ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                    className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 font-medium transition-colors ${
                      matched
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{word}</span>
                    {matched ? <Check className="h-3 w-3 shrink-0 text-blue-600" /> : null}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {history.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                <h4 className="text-xs font-semibold text-slate-900">Recognition Log</h4>
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {history.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    <span className="font-medium text-slate-900">{item.word}</span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-500">
                      {Math.round(item.confidence * 100)}% · {item.time}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
