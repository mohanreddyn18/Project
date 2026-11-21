import { AnimatePresence, motion } from 'motion/react';
import { Globe, Loader2, RotateCcw, Sparkles, Upload, UserCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import type { BoundingBoxItem, NationalityResult } from '../../types/vision';
import { fileToBase64, urlToBase64 } from '../../utils/media';
import { AnimatedNumber } from '../AnimatedNumber';
import { InspectionViewport } from '../InspectionViewport';
import { TactileCard } from '../TactileCard';

const SAMPLE_PORTRAIT = '/src/assets/images/sample_portrait_indian_1795104911918.jpg';

const CONDITIONAL_RULES = [
  { group: 'Indian', outputs: 'Nationality · Emotion · Age · Dress Colour' },
  { group: 'United States', outputs: 'Nationality · Age · Emotion' },
  { group: 'African', outputs: 'Nationality · Emotion · Dress Colour' },
  { group: 'Other', outputs: 'Nationality · Emotion' },
] as const;

interface NationalityModuleProps {
  onDetectionRecorded?: (count: number) => void;
}

export function NationalityModule({ onDetectionRecorded }: NationalityModuleProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(SAMPLE_PORTRAIT);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(
    null,
  );
  const [result, setResult] = useState<NationalityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  const handleFileChange = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const converted = await fileToBase64(file);
      setPreviewUrl(converted.dataUrl);
      setImagePayload({ base64: converted.base64, mimeType: converted.mimeType });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read image file.');
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      let payload = imagePayload;
      if (!payload && previewUrl) {
        const loaded = await urlToBase64(previewUrl);
        payload = { base64: loaded.base64, mimeType: loaded.mimeType };
        setImagePayload(payload);
      }
      if (!payload) {
        throw new Error('Please upload a portrait image first.');
      }
      const res = await fetch('/api/analyze/nationality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: payload.base64,
          mimeType: payload.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Nationality detection failed.');
      }
      const typed = data as NationalityResult;
      setResult(typed);
      onDetectionRecorded?.(typed.personDetected ? 1 : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nationality analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const boxes: BoundingBoxItem[] =
    result && result.personDetected && result.box_2d
      ? [
          {
            id: 'subject-1',
            label: result.displayedNationality,
            sublabel: result.emotion,
            color: 'blue',
            box_2d: result.box_2d,
          },
        ]
      : [];

  const showAge =
    result &&
    (result.nationalityGroup === 'Indian' || result.nationalityGroup === 'United States') &&
    result.age !== null;

  const showDressColor =
    result &&
    (result.nationalityGroup === 'Indian' || result.nationalityGroup === 'African') &&
    result.dressColor !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            04. Nationality &amp; Conditional Attribute Detection
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Predicts nationality and emotion, conditionally unlocking age and dress colour based on
            regional classification rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileChange(file);
              e.target.value = '';
            }}
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setPreviewUrl(SAMPLE_PORTRAIT);
              setImagePayload(null);
              setResult(null);
              setError(null);
            }}
            className="btn-3d-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Sample Portrait
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => fileInputRef.current?.click()}
            className="btn-3d-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Portrait
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleAnalyze}
            disabled={loading || !previewUrl}
            className="btn-3d-primary inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? 'Analyzing Portrait...' : 'Predict Attributes'}
          </motion.button>
        </div>
      </div>

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
        <div className="space-y-3 lg:col-span-7">
          <InspectionViewport
            imageUrl={previewUrl}
            alt="Subject portrait preview"
            boxes={boxes}
            onFileDrop={handleFileChange}
            dropLabel="Drop portrait photo to classify attributes"
            loading={loading}
            scanLabel="Predicting nationality & emotion..."
            emptyText="Drag and drop or upload an image to preview and analyze."
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels((v) => !v)}
          />
        </div>

        <div className="space-y-4 lg:col-span-5">
          <TactileCard>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Prediction Output</h3>
            </div>

            <AnimatePresence mode="wait">
              {!result ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-10 text-center"
                >
                  <Globe className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 text-xs text-slate-500">
                    Upload or use the sample portrait and click{' '}
                    <span className="font-medium text-slate-700">Predict Attributes</span> to view
                    conditional results.
                  </p>
                </motion.div>
              ) : !result.personDetected ? (
                <motion.div
                  key="no-person"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-5 text-sm text-amber-800"
                >
                  No person face clearly detected in this image. Please upload a clear portrait.
                </motion.div>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="divide-y divide-slate-100"
                >
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-xs text-slate-500">Predicted Nationality</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {result.displayedNationality}
                    </span>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-xs text-slate-500">Predicted Emotion</span>
                    <span className="text-sm font-semibold text-blue-600">{result.emotion}</span>
                  </div>

                  {showAge ? (
                    <motion.div
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.06 }}
                      className="flex items-center justify-between px-4 py-3.5"
                    >
                      <span className="text-xs text-slate-500">Predicted Age</span>
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        <AnimatedNumber value={result.age ?? 0} suffix=" years" />
                      </span>
                    </motion.div>
                  ) : null}

                  {showDressColor ? (
                    <motion.div
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.1 }}
                      className="flex items-center justify-between px-4 py-3.5"
                    >
                      <span className="text-xs text-slate-500">Predicted Dress Colour</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {result.dressColor}
                      </span>
                    </motion.div>
                  ) : null}

                  <div className="px-4 py-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Model Confidence</span>
                      <span className="font-mono text-xs font-medium text-slate-700">
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

                  <div className="bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                      <span>Active Rule: {result.nationalityGroup}</span>
                    </div>
                    <p className="mt-1">
                      {result.nationalityGroup === 'Indian'
                        ? 'Outputs Nationality, Emotion, Age, and Dress Colour.'
                        : result.nationalityGroup === 'United States'
                          ? 'Outputs Nationality, Age, and Emotion only.'
                          : result.nationalityGroup === 'African'
                            ? 'Outputs Nationality, Emotion, and Dress Colour only.'
                            : 'Outputs Nationality and Emotion only.'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TactileCard>

          <div className="surface-3d rounded-lg p-4">
            <h4 className="text-xs font-semibold text-slate-900">Conditional Output Matrix</h4>
            <dl className="mt-3 space-y-1.5 text-xs text-slate-600">
              {CONDITIONAL_RULES.map((rule) => {
                const isMatched = Boolean(
                  result?.personDetected && result.nationalityGroup === rule.group,
                );
                return (
                  <div
                    key={rule.group}
                    className="relative flex justify-between gap-2 overflow-hidden rounded-md px-2.5 py-2"
                  >
                    {isMatched ? (
                      <motion.div
                        layoutId="nationality-matched-rule"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-md border border-blue-200/80 bg-blue-50"
                      />
                    ) : null}
                    <dt
                      className={`relative z-10 font-medium transition-colors ${
                        isMatched ? 'text-blue-700' : 'text-slate-800'
                      }`}
                    >
                      {rule.group}
                    </dt>
                    <dd
                      className={`relative z-10 text-right transition-colors ${
                        isMatched ? 'font-medium text-blue-950' : ''
                      }`}
                    >
                      {rule.outputs}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
