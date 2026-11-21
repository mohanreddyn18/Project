import { motion } from 'motion/react';
import { Car, Loader2, RotateCcw, Sparkles, Upload, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import type { BoundingBoxItem, CarColorResult } from '../../types/vision';
import { fileToBase64, urlToBase64 } from '../../utils/media';
import { AnimatedNumber } from '../AnimatedNumber';
import { InspectionViewport } from '../InspectionViewport';
import { TactileCard } from '../TactileCard';

const SAMPLE_TRAFFIC_IMAGE = '/src/assets/images/sample_traffic_cars_1795104913002.jpg';

type CarFilter = 'all' | 'blue' | 'other';

interface CarColorModuleProps {
  onDetectionRecorded?: (count: number) => void;
}

export function CarColorModule({ onDetectionRecorded }: CarColorModuleProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(SAMPLE_TRAFFIC_IMAGE);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(
    null,
  );
  const [result, setResult] = useState<CarColorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showPeopleBoxes, setShowPeopleBoxes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [filter, setFilter] = useState<CarFilter>('all');

  const handleFileChange = async (file: File) => {
    setError(null);
    setResult(null);
    setHighlightedId(null);
    try {
      const converted = await fileToBase64(file);
      setPreviewUrl(converted.dataUrl);
      setImagePayload({ base64: converted.base64, mimeType: converted.mimeType });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load image file.');
    }
  };

  const handleUseSample = () => {
    setError(null);
    setResult(null);
    setHighlightedId(null);
    setFilter('all');
    setPreviewUrl(SAMPLE_TRAFFIC_IMAGE);
    setImagePayload(null);
  };

  const handleAnalyze = async () => {
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
        throw new Error('Please upload or select a traffic image first.');
      }

      const res = await fetch('/api/analyze/car-color', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: payload.base64,
          mimeType: payload.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Car colour detection failed.');
      }
      const typed = data as CarColorResult;
      setResult(typed);
      setFilter('all');
      onDetectionRecorded?.(typed.totalCars + typed.peopleCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis request failed.');
    } finally {
      setLoading(false);
    }
  };

  const filteredCars = result
    ? result.cars.filter((car) => {
        if (filter === 'blue') return car.isBlue;
        if (filter === 'other') return !car.isBlue;
        return true;
      })
    : [];

  const boxes: BoundingBoxItem[] = result
    ? [
        ...filteredCars.map((car) => ({
          id: car.id,
          label: `${car.color} ${car.vehicleType}`,
          sublabel: car.isBlue ? 'RED BOX' : 'BLUE BOX',
          color: (car.isBlue ? 'red' : 'blue') as 'red' | 'blue',
          box_2d: car.box_2d,
        })),
        ...(showPeopleBoxes
          ? result.people.map((person, idx) => ({
              id: person.id,
              label: `Person ${idx + 1}`,
              color: 'amber' as const,
              box_2d: person.box_2d,
            }))
          : []),
      ]
    : [];

  const selectedCar = result?.cars.find((c) => c.id === highlightedId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            01. Car Colour &amp; Traffic Signal Detection
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Detects vehicle paint colours at traffic signals with red bounding boxes for blue cars,
            blue bounding boxes for all other car colours, and pedestrian headcount.
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
            onClick={handleUseSample}
            className="btn-3d-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Sample Scene
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
            onClick={handleAnalyze}
            disabled={loading || !previewUrl}
            className="btn-3d-primary inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? 'Analyzing Traffic...' : 'Run Detection'}
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
        <div className="space-y-3 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border-2 border-red-600 bg-red-600/15" />
                Red rectangle = Blue cars
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border-2 border-blue-600 bg-blue-600/15" />
                Blue rectangle = Other car colours
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 border-2 border-amber-500 bg-amber-500/15" />
                Amber = People
              </span>
            </div>

            {result && result.peopleCount > 0 ? (
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-700">
                <input
                  type="checkbox"
                  checked={showPeopleBoxes}
                  onChange={(e) => setShowPeopleBoxes(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                Show person boxes
              </label>
            ) : null}
          </div>

          <InspectionViewport
            imageUrl={previewUrl}
            alt="Traffic signal preview"
            boxes={boxes}
            highlightedId={highlightedId}
            onSelectBox={(id) => setHighlightedId((prev) => (prev === id ? null : id))}
            onClearHighlight={() => setHighlightedId(null)}
            onFileDrop={handleFileChange}
            dropLabel="Drop traffic scene image to analyze"
            loading={loading}
            scanLabel="Scanning vehicles & pedestrians..."
            emptyText="Drag and drop or upload a traffic image to preview."
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels((v) => !v)}
          />

          {selectedCar ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">
                  Selected: {selectedCar.color} {selectedCar.vehicleType}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-600">
                  Confidence {Math.round(selectedCar.confidence * 100)}%
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono font-semibold ${
                    selectedCar.isBlue ? 'text-red-600' : 'text-blue-600'
                  }`}
                >
                  {selectedCar.isBlue ? 'Red Rectangle' : 'Blue Rectangle'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHighlightedId(null)}
                className="font-medium text-slate-500 hover:text-slate-900"
              >
                Clear focus
              </button>
            </motion.div>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-4">
          <TactileCard>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Traffic Signal Summary</h3>
            </div>

            {!result ? (
              <div className="px-4 py-8 text-center">
                <Car className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-xs text-slate-500">
                  Click <span className="font-medium text-slate-700">Run Detection</span> to count
                  vehicles, highlight blue vs. non-blue cars, and count pedestrians.
                </p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="divide-y divide-slate-100"
              >
                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  <div className="p-4">
                    <div className="text-xs text-slate-500">Total Cars</div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-slate-900">
                      <AnimatedNumber value={result.totalCars} />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Users className="h-3.5 w-3.5 text-amber-600" />
                      <span>People Present</span>
                    </div>
                    <div className="mt-1 font-mono text-2xl font-semibold text-slate-900">
                      <AnimatedNumber value={result.peopleCount} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  <div className="p-4">
                    <div className="text-xs text-red-700">Blue Cars (Red Box)</div>
                    <div className="mt-1 font-mono text-xl font-semibold text-red-600">
                      <AnimatedNumber value={result.blueCarsCount} />
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-blue-700">Other Colours (Blue Box)</div>
                    <div className="mt-1 font-mono text-xl font-semibold text-blue-600">
                      <AnimatedNumber value={result.otherCarsCount} />
                    </div>
                  </div>
                </div>

                <div className="p-4 text-xs leading-relaxed text-slate-600">{result.summary}</div>
              </motion.div>
            )}
          </TactileCard>

          {result && result.cars.length > 0 ? (
            <div className="surface-3d rounded-lg">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Vehicles ({filteredCars.length})
                </h3>
                <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 text-[11px]">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'blue', label: 'Blue' },
                      { id: 'other', label: 'Other' },
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
                          layoutId="car-filter-tab"
                          transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                          className="absolute inset-0 rounded bg-white shadow-xs"
                        />
                      ) : null}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Vehicle</th>
                      <th className="px-3 py-2 font-medium">Colour</th>
                      <th className="px-4 py-2 text-right font-medium">Box</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCars.map((car, idx) => {
                      const active = highlightedId === car.id;
                      return (
                        <motion.tr
                          key={car.id}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.18, delay: Math.min(idx * 0.03, 0.25) }}
                          onClick={() =>
                            setHighlightedId((prev) => (prev === car.id ? null : car.id))
                          }
                          onMouseEnter={() => setHighlightedId(car.id)}
                          onMouseLeave={() => setHighlightedId(null)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {car.vehicleType}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">{car.color}</td>
                          <td
                            className={`px-4 py-2.5 text-right font-mono font-semibold ${
                              car.isBlue ? 'text-red-600' : 'text-blue-600'
                            }`}
                          >
                            {car.isBlue ? 'RED' : 'BLUE'}
                          </td>
                        </motion.tr>
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
