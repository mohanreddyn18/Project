import { motion } from 'motion/react';
import { AlertTriangle, Eye, EyeOff, Film, Image as ImageIcon, Loader2, PawPrint, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AnalyzedVideoFrame, AnimalDetectionResult, BoundingBoxItem } from '../../types/vision';
import { fileToBase64, urlToBase64 } from '../../utils/media';
import { AlertModal } from '../AlertModal';
import { AnimatedNumber } from '../AnimatedNumber';
import { BoundingBoxOverlay } from '../BoundingBoxOverlay';
import { InteractiveDropZone } from '../InteractiveDropZone';
import { ScanBeamOverlay } from '../ScanBeamOverlay';
import { VideoFrameAnalyzer } from '../VideoFrameAnalyzer';

const SAMPLE_WILDLIFE_IMAGE = '/src/assets/images/sample_wildlife_animals_1795104911128.jpg';

type DietFilter = 'all' | 'carnivore' | 'other';

export function AnimalDetectionModule() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(SAMPLE_WILDLIFE_IMAGE);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(
    null,
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnimalDetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [dietFilter, setDietFilter] = useState<DietFilter>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [popupAlert, setPopupAlert] = useState<{
    open: boolean;
    count: number;
    species: string[];
  }>({ open: false, count: 0, species: [] });

  const callAnimalApi = async (base64: string, mimeType: string): Promise<AnimalDetectionResult> => {
    const res = await fetch('/api/analyze/animals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Animal detection failed.');
    }
    return data as AnimalDetectionResult;
  };

  const mapAnimalsToBoxes = (res: AnimalDetectionResult): BoundingBoxItem[] =>
    res.animals
      .filter((animal) => {
        if (dietFilter === 'carnivore') return animal.isCarnivore;
        if (dietFilter === 'other') return !animal.isCarnivore;
        return true;
      })
      .map((animal) => ({
        id: animal.id,
        label: animal.species,
        sublabel: animal.isCarnivore ? 'CARNIVORE' : animal.dietType.toUpperCase(),
        color: animal.isCarnivore ? 'red' : 'emerald',
        box_2d: animal.box_2d,
      }));

  const handleImageFile = async (file: File) => {
    setError(null);
    setResult(null);
    setHighlightedId(null);
    try {
      const converted = await fileToBase64(file);
      setPreviewUrl(converted.dataUrl);
      setImagePayload({ base64: converted.base64, mimeType: converted.mimeType });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load image.');
    }
  };

  const handleVideoFile = (file: File) => {
    setError(null);
    setResult(null);
    setDietFilter('all');
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  };

  const handleAnalyzeImage = async () => {
    setLoading(true);
    setError(null);
    setHighlightedId(null);
    try {
      let payload = imagePayload;
      if (!payload && previewUrl) {
        const loaded = await urlToBase64(previewUrl);
        payload = { base64: loaded.base64, mimeType: loaded.mimeType };
        setImagePayload(payload);
      }
      if (!payload) {
        throw new Error('Please upload or select an image first.');
      }
      const data = await callAnimalApi(payload.base64, payload.mimeType);
      setResult(data);
      setDietFilter('all');
      if (data.carnivoreCount > 0) {
        setPopupAlert({
          open: true,
          count: data.carnivoreCount,
          species: data.carnivoreSpecies,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Animal detection failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoFramesAnalyzed = (
    frames: AnalyzedVideoFrame<AnimalDetectionResult>[],
    activeFrame: AnalyzedVideoFrame<AnimalDetectionResult>,
  ) => {
    setResult(activeFrame.result);
    const maxCarnivoreFrame = frames.reduce(
      (best, f) => (f.result.carnivoreCount > best.result.carnivoreCount ? f : best),
      activeFrame,
    );
    const allCarnivoreSpecies = Array.from(
      new Set(frames.flatMap((f) => f.result.carnivoreSpecies)),
    );
    if (maxCarnivoreFrame.result.carnivoreCount > 0) {
      setPopupAlert({
        open: true,
        count: maxCarnivoreFrame.result.carnivoreCount,
        species: allCarnivoreSpecies,
      });
    }
  };

  const filteredAnimals = result
    ? result.animals.filter((animal) => {
        if (dietFilter === 'carnivore') return animal.isCarnivore;
        if (dietFilter === 'other') return !animal.isCarnivore;
        return true;
      })
    : [];

  const boxes = result ? mapAnimalsToBoxes(result) : [];

  return (
    <div className="space-y-6">
      <AlertModal
        open={popupAlert.open}
        title="Carnivorous Animal Alert"
        message={`Detected ${popupAlert.count} carnivorous animal${
          popupAlert.count === 1 ? '' : 's'
        } highlighted in red.`}
        details={
          popupAlert.species.length > 0
            ? [`Detected carnivore species: ${popupAlert.species.join(', ')}`]
            : []
        }
        onClose={() => setPopupAlert((prev) => ({ ...prev, open: false }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            02. Multi-Species Animal Detection
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Identifies multiple species across images or video frames, highlights carnivorous
            animals in red, and triggers a carnivore count alert.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'image', label: 'Image Mode', Icon: ImageIcon },
                { id: 'video', label: 'Video Mode', Icon: Film },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setResult(null);
                  setError(null);
                  setDietFilter('all');
                }}
                className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === id ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === id ? (
                  <motion.span
                    layoutId="animal-mode-pill"
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
                  setPreviewUrl(SAMPLE_WILDLIFE_IMAGE);
                  setImagePayload(null);
                  setResult(null);
                  setError(null);
                  setDietFilter('all');
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Sample Wildlife
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Image
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleAnalyzeImage}
                disabled={loading || !previewUrl}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {loading ? 'Detecting Animals...' : 'Run Detection'}
              </motion.button>
            </>
          ) : null}
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

      {result && result.carnivoreCount > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              <strong>{result.carnivoreCount}</strong> carnivorous animal
              {result.carnivoreCount === 1 ? '' : 's'} detected ({result.carnivoreSpecies.join(', ')})
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setPopupAlert({
                open: true,
                count: result.carnivoreCount,
                species: result.carnivoreSpecies,
              })
            }
            className="text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-800 whitespace-nowrap"
          >
            View Pop-up Alert
          </button>
        </motion.div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border-2 border-red-600 bg-red-600/15" />
                Red highlight = Carnivorous animal
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border-2 border-emerald-600 bg-emerald-600/15" />
                Green highlight = Herbivore / Omnivore
              </span>
            </div>
            {result ? (
              <button
                type="button"
                onClick={() => setShowLabels((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
              >
                {showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {showLabels ? 'Hide Labels' : 'Show Labels'}
              </button>
            ) : null}
          </div>

          {mode === 'image' ? (
            <InteractiveDropZone
              onFileDrop={handleImageFile}
              acceptPrefix="image/"
              dropLabel="Drop wildlife photo to classify species"
            >
              <div
                onClick={() => setHighlightedId(null)}
                className="relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-3"
              >
                {previewUrl ? (
                  <div className="relative inline-block max-w-full">
                    <img
                      src={previewUrl}
                      alt="Animal detection preview"
                      referrerPolicy="no-referrer"
                      className="block max-h-[460px] w-auto max-w-full rounded-xs"
                    />
                    <BoundingBoxOverlay
                      boxes={boxes}
                      highlightedId={highlightedId}
                      showLabels={showLabels}
                      onSelectBox={(id) => setHighlightedId((prev) => (prev === id ? null : id))}
                    />
                    <ScanBeamOverlay active={loading} label="Classifying species & diet..." />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Upload an image to begin detection.</p>
                )}
              </div>
            </InteractiveDropZone>
          ) : (
            <VideoFrameAnalyzer<AnimalDetectionResult>
              videoUrl={videoUrl}
              onVideoSelect={handleVideoFile}
              analyzeFrame={callAnimalApi}
              mapResultToBoxes={mapAnimalsToBoxes}
              onFramesAnalyzed={handleVideoFramesAnalyzed}
              analyzing={loading}
              setAnalyzing={setLoading}
              onError={setError}
              emptyPrompt="Upload a wildlife or animal video clip to detect multiple species per frame and highlight carnivores in red."
            />
          )}
        </div>

        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Species &amp; Carnivore Count</h3>
            </div>

            {!result ? (
              <div className="px-4 py-8 text-center">
                <PawPrint className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-xs text-slate-500">
                  Run detection on an image or video frame to classify species and count carnivorous
                  animals.
                </p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="divide-y divide-slate-100"
              >
                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  <div className="p-4">
                    <div className="text-xs text-slate-500">Total Animals</div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-slate-900">
                      <AnimatedNumber value={result.totalAnimals} />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-red-700">Carnivores</div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-red-600">
                      <AnimatedNumber value={result.carnivoreCount} />
                    </div>
                  </div>
                </div>
                <div className="p-4 text-xs leading-relaxed text-slate-600">{result.summary}</div>
              </motion.div>
            )}
          </div>

          {result && result.animals.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Species ({filteredAnimals.length})
                </h3>
                <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 text-[11px]">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'carnivore', label: 'Carnivores' },
                      { id: 'other', label: 'Others' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setDietFilter(tab.id);
                        setHighlightedId(null);
                      }}
                      className={`relative rounded px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                        dietFilter === tab.id
                          ? 'text-slate-900'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {dietFilter === tab.id ? (
                        <motion.span
                          layoutId="animal-filter-tab"
                          transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                          className="absolute inset-0 rounded bg-white shadow-xs"
                        />
                      ) : null}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Species</th>
                      <th className="px-3 py-2 font-medium">Diet</th>
                      <th className="px-4 py-2 text-right font-medium">Conf.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAnimals.map((animal) => {
                      const active = highlightedId === animal.id;
                      return (
                        <tr
                          key={animal.id}
                          onClick={() =>
                            setHighlightedId((prev) => (prev === animal.id ? null : animal.id))
                          }
                          onMouseEnter={() => setHighlightedId(animal.id)}
                          onMouseLeave={() => setHighlightedId(null)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-red-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {animal.species}
                          </td>
                          <td
                            className={`px-3 py-2.5 font-medium capitalize ${
                              animal.isCarnivore ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {animal.dietType}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {Math.round(animal.confidence * 100)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
