import { motion } from 'motion/react';
import { AlertTriangle, Eye, EyeOff, Film, Image as ImageIcon, Loader2, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AnalyzedVideoFrame, BoundingBoxItem, DrowsinessResult } from '../../types/vision';
import { fileToBase64, urlToBase64 } from '../../utils/media';
import { AlertModal } from '../AlertModal';
import { AnimatedNumber } from '../AnimatedNumber';
import { BoundingBoxOverlay } from '../BoundingBoxOverlay';
import { InteractiveDropZone } from '../InteractiveDropZone';
import { ScanBeamOverlay } from '../ScanBeamOverlay';
import { VideoFrameAnalyzer } from '../VideoFrameAnalyzer';

const SAMPLE_CABIN_IMAGE = '/src/assets/images/sample_vehicle_drowsiness_1795104911996.jpg';

type OccupantFilter = 'all' | 'sleeping' | 'awake';

export function DrowsinessModule() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(SAMPLE_CABIN_IMAGE);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(
    null,
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DrowsinessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OccupantFilter>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [popupAlert, setPopupAlert] = useState<{
    open: boolean;
    sleepingCount: number;
    sleepingAges: number[];
  }>({ open: false, sleepingCount: 0, sleepingAges: [] });

  const callDrowsinessApi = async (
    base64: string,
    mimeType: string,
  ): Promise<DrowsinessResult> => {
    const res = await fetch('/api/analyze/drowsiness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Drowsiness detection failed.');
    }
    return data as DrowsinessResult;
  };

  const mapOccupantsToBoxes = (res: DrowsinessResult): BoundingBoxItem[] =>
    res.occupants
      .filter((person) => {
        if (filter === 'sleeping') return person.isSleeping;
        if (filter === 'awake') return !person.isSleeping;
        return true;
      })
      .map((person) => ({
        id: person.id,
        label: person.isSleeping ? `SLEEPING · Age ${person.estimatedAge}` : 'Awake',
        sublabel: person.role.toUpperCase(),
        color: person.isSleeping ? 'red' : 'emerald',
        box_2d: person.box_2d,
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
    setFilter('all');
    setVideoUrl(URL.createObjectURL(file));
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
        throw new Error('Please upload or select a vehicle cabin image first.');
      }
      const data = await callDrowsinessApi(payload.base64, payload.mimeType);
      setResult(data);
      setFilter('all');
      if (data.sleepingCount > 0) {
        setPopupAlert({
          open: true,
          sleepingCount: data.sleepingCount,
          sleepingAges: data.sleepingAges,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Drowsiness analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoFramesAnalyzed = (
    frames: AnalyzedVideoFrame<DrowsinessResult>[],
    activeFrame: AnalyzedVideoFrame<DrowsinessResult>,
  ) => {
    setResult(activeFrame.result);
    const worstFrame = frames.reduce(
      (best, f) => (f.result.sleepingCount > best.result.sleepingCount ? f : best),
      activeFrame,
    );
    if (worstFrame.result.sleepingCount > 0) {
      setPopupAlert({
        open: true,
        sleepingCount: worstFrame.result.sleepingCount,
        sleepingAges: worstFrame.result.sleepingAges,
      });
    }
  };

  const filteredOccupants = result
    ? result.occupants.filter((p) => {
        if (filter === 'sleeping') return p.isSleeping;
        if (filter === 'awake') return !p.isSleeping;
        return true;
      })
    : [];

  const boxes = result ? mapOccupantsToBoxes(result) : [];

  return (
    <div className="space-y-6">
      <AlertModal
        open={popupAlert.open}
        title="Vehicle Drowsiness Alert"
        message={`Detected ${popupAlert.sleepingCount} sleeping ${
          popupAlert.sleepingCount === 1 ? 'person' : 'people'
        } inside the vehicle.`}
        details={
          popupAlert.sleepingAges.length > 0
            ? popupAlert.sleepingAges.map(
                (age, idx) => `Sleeping Person ${idx + 1}: Predicted Age ${age} years`,
              )
            : []
        }
        onClose={() => setPopupAlert((prev) => ({ ...prev, open: false }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            06. Vehicle Drowsiness Detection
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Detects awake vs. sleeping occupants inside a vehicle across images or video, marks
            sleeping individuals in red with predicted age, and triggers a drowsiness pop-up alert.
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
                  setFilter('all');
                }}
                className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  mode === id ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === id ? (
                  <motion.span
                    layoutId="drowsiness-mode-pill"
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
                  setPreviewUrl(SAMPLE_CABIN_IMAGE);
                  setImagePayload(null);
                  setResult(null);
                  setError(null);
                  setFilter('all');
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Sample Cabin
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
                {loading ? 'Analyzing Cabin...' : 'Detect Drowsiness'}
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

      {result && result.sleepingCount > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              <strong>{result.sleepingCount}</strong> sleeping{' '}
              {result.sleepingCount === 1 ? 'person' : 'people'} detected · Predicted ages:{' '}
              <span className="font-mono font-semibold tabular-nums">
                {result.sleepingAges.join(', ')}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setPopupAlert({
                open: true,
                sleepingCount: result.sleepingCount,
                sleepingAges: result.sleepingAges,
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
                Red box = Sleeping occupant (+ predicted age)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border-2 border-emerald-600 bg-emerald-600/15" />
                Green box = Awake occupant
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
              dropLabel="Drop vehicle cabin photo to inspect occupancy"
            >
              <div
                onClick={() => setHighlightedId(null)}
                className="relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-950 p-3"
              >
                {previewUrl ? (
                  <div className="relative inline-block max-w-full">
                    <img
                      src={previewUrl}
                      alt="Vehicle cabin preview"
                      referrerPolicy="no-referrer"
                      className="block max-h-[460px] w-auto max-w-full rounded-xs"
                    />
                    <BoundingBoxOverlay
                      boxes={boxes}
                      highlightedId={highlightedId}
                      showLabels={showLabels}
                      onSelectBox={(id) => setHighlightedId((prev) => (prev === id ? null : id))}
                    />
                    <ScanBeamOverlay active={loading} label="Inspecting cabin occupants..." />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Drag and drop or upload a vehicle interior photo.
                  </p>
                )}
              </div>
            </InteractiveDropZone>
          ) : (
            <VideoFrameAnalyzer<DrowsinessResult>
              videoUrl={videoUrl}
              onVideoSelect={handleVideoFile}
              analyzeFrame={callDrowsinessApi}
              mapResultToBoxes={mapOccupantsToBoxes}
              onFramesAnalyzed={handleVideoFramesAnalyzed}
              analyzing={loading}
              setAnalyzing={setLoading}
              onError={setError}
              emptyPrompt="Upload a dashcam or cabin video clip to detect sleeping occupants, mark them in red, and predict their ages."
            />
          )}
        </div>

        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Cabin Occupancy Status</h3>
            </div>

            {!result ? (
              <div className="px-4 py-8 text-center">
                <EyeOff className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-xs text-slate-500">
                  Run detection to count total occupants, identify sleeping individuals in red, and
                  estimate their ages.
                </p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="divide-y divide-slate-100"
              >
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  <div className="p-3.5">
                    <div className="text-[11px] text-slate-500">People</div>
                    <div className="mt-1 font-mono text-xl font-semibold text-slate-900">
                      <AnimatedNumber value={result.totalPeople} />
                    </div>
                  </div>
                  <div className="p-3.5">
                    <div className="text-[11px] text-red-700">Sleeping</div>
                    <div className="mt-1 font-mono text-xl font-semibold text-red-600">
                      <AnimatedNumber value={result.sleepingCount} />
                    </div>
                  </div>
                  <div className="p-3.5">
                    <div className="text-[11px] text-emerald-700">Awake</div>
                    <div className="mt-1 font-mono text-xl font-semibold text-emerald-600">
                      <AnimatedNumber value={result.awakeCount} />
                    </div>
                  </div>
                </div>
                <div className="p-4 text-xs leading-relaxed text-slate-600">{result.summary}</div>
              </motion.div>
            )}
          </div>

          {result && result.occupants.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Occupants ({filteredOccupants.length})
                </h3>
                <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 text-[11px]">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'sleeping', label: 'Sleeping' },
                      { id: 'awake', label: 'Awake' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setFilter(tab.id);
                        setHighlightedId(null);
                      }}
                      className={`relative rounded px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                        filter === tab.id ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {filter === tab.id ? (
                        <motion.span
                          layoutId="drowsiness-filter-tab"
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
                      <th className="px-4 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Pred. Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOccupants.map((person) => {
                      const active = highlightedId === person.id;
                      return (
                        <tr
                          key={person.id}
                          onClick={() =>
                            setHighlightedId((prev) => (prev === person.id ? null : person.id))
                          }
                          onMouseEnter={() => setHighlightedId(person.id)}
                          onMouseLeave={() => setHighlightedId(null)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-red-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-2.5 font-medium capitalize text-slate-900">
                            {person.role}
                          </td>
                          <td
                            className={`px-3 py-2.5 font-semibold capitalize ${
                              person.isSleeping ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {person.state}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {person.isSleeping ? `${person.estimatedAge} yrs` : '—'}
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
