import { motion } from 'motion/react';
import { Film, Loader2, Play, ScanLine, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AnalyzedVideoFrame, BoundingBoxItem } from '../types/vision';
import { captureVideoFrame, seekAndCaptureFrame } from '../utils/media';
import { BoundingBoxOverlay } from './BoundingBoxOverlay';
import { InteractiveDropZone } from './InteractiveDropZone';
import { ScanBeamOverlay } from './ScanBeamOverlay';

interface VideoFrameAnalyzerProps<T> {
  videoUrl: string | null;
  onVideoSelect: (file: File) => void;
  analyzeFrame: (frameBase64: string, mimeType: string) => Promise<T>;
  mapResultToBoxes: (result: T) => BoundingBoxItem[];
  onFramesAnalyzed: (
    frames: AnalyzedVideoFrame<T>[],
    activeFrame: AnalyzedVideoFrame<T>,
    isNewScan?: boolean,
  ) => void;
  analyzing: boolean;
  setAnalyzing: (busy: boolean) => void;
  onError: (message: string) => void;
  emptyPrompt: string;
}

export function VideoFrameAnalyzer<T>({
  videoUrl,
  onVideoSelect,
  analyzeFrame,
  mapResultToBoxes,
  onFramesAnalyzed,
  analyzing,
  setAnalyzing,
  onError,
  emptyPrompt,
}: VideoFrameAnalyzerProps<T>) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [frames, setFrames] = useState<AnalyzedVideoFrame<T>[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scanProgress, setScanProgress] = useState<string | null>(null);

  useEffect(() => {
    setFrames([]);
    setCurrentTime(0);
    setDuration(0);
    setScanProgress(null);
  }, [videoUrl]);

  const activeFrame =
    frames.length > 0
      ? frames.reduce((closest, candidate) =>
          Math.abs(candidate.timestamp - currentTime) < Math.abs(closest.timestamp - currentTime)
            ? candidate
            : closest,
        )
      : null;

  const activeBoxes = activeFrame ? mapResultToBoxes(activeFrame.result) : [];

  const handleAnalyzeCurrent = async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setAnalyzing(true);
    setScanProgress('Capturing current frame...');
    try {
      video.pause();
      const captured = captureVideoFrame(video);
      setScanProgress('Running model inference...');
      const result = await analyzeFrame(captured.base64, captured.mimeType);
      const entry: AnalyzedVideoFrame<T> = {
        timestamp: video.currentTime,
        dataUrl: captured.dataUrl,
        result,
      };
      const updated = [entry];
      setFrames(updated);
      onFramesAnalyzed(updated, entry, true);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to analyze video frame.');
    } finally {
      setAnalyzing(false);
      setScanProgress(null);
    }
  };

  const handleScanTimeline = async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setAnalyzing(true);
    try {
      video.pause();
      const totalDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const sampleCount = totalDuration < 2 ? 1 : 4;
      const timestamps =
        sampleCount === 1
          ? [0]
          : Array.from({ length: sampleCount }, (_, i) =>
              Number(((totalDuration * (i + 0.5)) / sampleCount).toFixed(2)),
            );

      const collected: AnalyzedVideoFrame<T>[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        setScanProgress(`Analyzing frame ${i + 1} of ${timestamps.length} (${ts.toFixed(1)}s)...`);
        const captured = await seekAndCaptureFrame(video, ts);
        const result = await analyzeFrame(captured.base64, captured.mimeType);
        collected.push({
          timestamp: ts,
          dataUrl: captured.dataUrl,
          result,
        });
      }
      setFrames(collected);
      if (collected.length > 0) {
        video.currentTime = collected[0].timestamp;
        onFramesAnalyzed(collected, collected[0], true);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to scan video timeline.');
    } finally {
      setAnalyzing(false);
      setScanProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onVideoSelect(file);
          e.target.value = '';
        }}
      />

      <InteractiveDropZone
        onFileDrop={onVideoSelect}
        acceptPrefix="video/"
        dropLabel="Drop video file to load into analyzer"
      >
        {!videoUrl ? (
          <motion.div
            whileHover={{ borderColor: '#3b82f6' }}
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-[340px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-900/5 px-6 py-12 text-center transition-colors hover:bg-blue-50/40"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs">
              <Film className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-slate-900">
              Drag &amp; drop or upload a video file for detection
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">{emptyPrompt}</p>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              Select Video (MP4 / WebM)
            </motion.button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
              <div className="relative mx-auto flex max-h-[460px] w-full items-center justify-center">
                <div className="relative inline-block max-h-[460px] w-full">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    playsInline
                    onTimeUpdate={() => {
                      if (videoRef.current) {
                        setCurrentTime(videoRef.current.currentTime);
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        setDuration(videoRef.current.duration || 0);
                      }
                    }}
                    className="mx-auto max-h-[460px] w-full object-contain"
                  />
                  <BoundingBoxOverlay boxes={activeBoxes} />
                  <ScanBeamOverlay active={analyzing} label={scanProgress || 'Scanning video...'} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
                <span>
                  Position: {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                </span>
                {frames.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-900 font-medium">
                      {frames.length} analyzed keyframe{frames.length === 1 ? '' : 's'}
                    </span>
                  </>
                ) : null}
                {scanProgress ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-blue-600">{scanProgress}</span>
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={analyzing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Change Video
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAnalyzeCurrent}
                  disabled={analyzing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {analyzing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Analyze Current Frame
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleScanTimeline}
                  disabled={analyzing}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {analyzing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ScanLine className="h-3.5 w-3.5" />
                  )}
                  Scan Video Timeline
                </motion.button>
              </div>
            </div>

            {frames.length > 1 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {frames.map((frame, index) => {
                  const isSelected = activeFrame?.timestamp === frame.timestamp;
                  return (
                    <motion.button
                      key={frame.timestamp}
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: index * 0.05 }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = frame.timestamp;
                        }
                        setCurrentTime(frame.timestamp);
                        onFramesAnalyzed(frames, frame, false);
                      }}
                      className={`group overflow-hidden rounded-md border text-left transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/40'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={frame.dataUrl}
                        alt={`Keyframe ${index + 1}`}
                        referrerPolicy="no-referrer"
                        className="h-20 w-full object-cover"
                      />
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-mono tabular-nums text-slate-700">
                        <span>Frame {index + 1}</span>
                        <span>{frame.timestamp.toFixed(1)}s</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </InteractiveDropZone>
    </div>
  );
}
