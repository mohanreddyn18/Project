import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, AudioLines, Box, Check, Loader2, Mic, Sparkles, Square, Upload, Waves } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { VoiceEmotionResult } from '../../types/vision';
import { fileToBase64 } from '../../utils/media';
import { AnimatedNumber } from '../AnimatedNumber';
import { AudioSpectrum3D } from '../AudioSpectrum3D';
import { InteractiveDropZone } from '../InteractiveDropZone';
import { TactileCard } from '../TactileCard';

interface VoiceEmotionModuleProps {
  onMicStateChange?: (active: boolean, permission?: 'granted' | 'denied') => void;
  onDetectionRecorded?: (count: number) => void;
}

export function VoiceEmotionModule({
  onMicStateChange,
  onDetectionRecorded,
}: VoiceEmotionModuleProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const playbackFrameRef = useRef<number | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLabel, setAudioLabel] = useState<string>('No audio loaded');
  const [audioPayload, setAudioPayload] = useState<{ base64: string; mimeType: string } | null>(
    null,
  );
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceEmotionResult | null>(null);
  const [visualMode, setVisualMode] = useState<'2d' | '3d'>('3d');
  const [activeAnalyser, setActiveAnalyser] = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      stopVisualizer();
      stopPlaybackVisualizer();
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      onMicStateChange?.(false);
    };
  }, []);

  const stopVisualizer = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const stopPlaybackVisualizer = () => {
    if (playbackFrameRef.current !== null) {
      cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
  };

  const drawFrequencyBars = (
    analyser: AnalyserNode,
    canvas: HTMLCanvasElement | null,
    rafRef: { current: number | null },
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 48;
    const peaks = new Float32Array(barCount);

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle reference grid lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (const ratio of [0.25, 0.5, 0.75]) {
        const gy = Math.round(canvas.height * ratio) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(canvas.width, gy);
        ctx.stroke();
      }

      const step = Math.max(1, Math.floor(bufferLength / barCount));
      const barWidth = canvas.width / barCount - 3;

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barH = Math.max(3, val * (canvas.height - 16));
        peaks[i] = Math.max(barH, peaks[i] - 0.8);
        const x = i * (barWidth + 3) + 1.5;
        const y = canvas.height - barH - 6;

        const grad = ctx.createLinearGradient(0, y, 0, canvas.height - 6);
        grad.addColorStop(0, val > 0.6 ? '#93c5fd' : '#60a5fa');
        grad.addColorStop(1, '#1d4ed8');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barWidth, barH);

        // Peak cap indicator
        const peakY = canvas.height - peaks[i] - 8;
        ctx.fillStyle = val > 0.6 ? '#dbeafe' : 'rgba(147, 197, 253, 0.7)';
        ctx.fillRect(x, peakY, barWidth, 1.5);
      }
    };
    render();
  };

  const handleAudioPlay = () => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;
    setIsPlaying(true);

    if (!playbackCtxRef.current) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audioEl);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      playbackCtxRef.current = ctx;
      playbackSourceRef.current = source;
      setActiveAnalyser(analyser);
      if (playbackCanvasRef.current) {
        drawFrequencyBars(analyser, playbackCanvasRef.current, playbackFrameRef);
      }
    } else {
      if (playbackCtxRef.current.state === 'suspended') {
        playbackCtxRef.current.resume().catch(() => {});
      }
      if (activeAnalyser && playbackCanvasRef.current && playbackFrameRef.current === null) {
        drawFrequencyBars(activeAnalyser, playbackCanvasRef.current, playbackFrameRef);
      }
    }
  };

  const drawWaveform = (analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(dataArray);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Center oscilloscope axis
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#60a5fa';
      ctx.shadowColor = 'rgba(59, 130, 246, 0.45)';
      ctx.shadowBlur = 6;
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    render();
  };

  const handleStartRecording = async () => {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      setActiveAnalyser(analyser);
      if (canvasRef.current) {
        drawWaveform(analyser);
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stopVisualizer();
        setActiveAnalyser(null);
        setIsPlaying(false);
        stream.getTracks().forEach((t) => t.stop());
        onMicStateChange?.(false, 'granted');
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], `recorded-voice.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`, {
          type: mimeType,
        });
        const converted = await fileToBase64(file);
        const objectUrl = URL.createObjectURL(blob);
        playbackCtxRef.current?.close().catch(() => {});
        playbackCtxRef.current = null;
        playbackSourceRef.current = null;
        setAudioUrl(objectUrl);
        setAudioLabel(`Microphone Recording (${recordSeconds}s)`);
        setAudioPayload({ base64: converted.base64, mimeType });
      };

      mediaRecorderRef.current = recorder;
      setRecordSeconds(0);
      setRecording(true);
      onMicStateChange?.(true, 'granted');
      recorder.start();
    } catch (err) {
      onMicStateChange?.(false, 'denied');
      setError(
        err instanceof Error
          ? err.message
          : 'Microphone access denied. Please allow microphone permissions or upload a voice note.',
      );
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    onMicStateChange?.(false);
  };

  const handleFileUpload = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const converted = await fileToBase64(file);
      const objectUrl = URL.createObjectURL(file);
      playbackCtxRef.current?.close().catch(() => {});
      playbackCtxRef.current = null;
      playbackSourceRef.current = null;
      setAudioUrl(objectUrl);
      setAudioLabel(file.name);
      setAudioPayload({
        base64: converted.base64,
        mimeType: file.type || 'audio/wav',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read audio file.');
    }
  };

  const handleAnalyze = async () => {
    if (!audioPayload) {
      setError('Please upload a voice note or record audio first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze/voice-emotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: audioPayload.base64,
          mimeType: audioPayload.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Voice emotion analysis failed.');
      }
      const typed = data as VoiceEmotionResult;
      setResult(typed);
      onDetectionRecorded?.(typed.hasSpeech ? 1 : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice analysis request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            03. Emotion Detection through Voice
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Detects spoken emotions from uploaded voice notes or live recordings. Operates
            exclusively on female voices and rejects non-female speech inputs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={recording}
            className="btn-3d-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-slate-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Voice Note
          </motion.button>

          {!recording ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleStartRecording}
              className="btn-3d-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-slate-800 transition-colors whitespace-nowrap"
            >
              <Mic className="h-3.5 w-3.5 text-red-600" />
              Record Voice
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleStopRecording}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700 whitespace-nowrap"
            >
              <Square className="h-3.5 w-3.5" />
              Stop ({recordSeconds}s)
            </motion.button>
          )}

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleAnalyze}
            disabled={loading || recording || !audioPayload}
            className="btn-3d-primary inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? 'Analyzing Voice...' : 'Analyze Emotion'}
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
        <div className="space-y-4 lg:col-span-7">
          <InteractiveDropZone
            onFileDrop={handleFileUpload}
            acceptPrefix="audio/"
            dropLabel="Drop voice note (WAV, MP3, WebM) here"
          >
            <div className="surface-3d rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <div className="text-xs font-medium text-slate-500">Audio Input Source</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{audioLabel}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setVisualMode('2d')}
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                        visualMode === '2d'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Waves className="h-3 w-3" />
                      <span>2D Wave</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualMode('3d')}
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                        visualMode === '3d'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Box className="h-3 w-3" />
                      <span>3D Harmonic</span>
                    </button>
                  </div>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {recording ? (
                  <motion.div
                    key="recording-stage"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                    className="space-y-2"
                  >
                    {visualMode === '3d' ? (
                      <AudioSpectrum3D
                        analyser={activeAnalyser}
                        active={true}
                        analyzing={loading}
                      />
                    ) : (
                      <canvas
                        ref={canvasRef}
                        width={640}
                        height={140}
                        className="h-36 w-full rounded-md border border-slate-800 bg-[#090d16]"
                      />
                    )}
                    <p className="flex items-center gap-2 text-xs font-mono tabular-nums text-red-600">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
                      <span>
                        Recording live microphone input ({recordSeconds}s)... Speak naturally, then
                        click Stop.
                      </span>
                    </p>
                  </motion.div>
                ) : audioUrl ? (
                  <motion.div
                    key="playback-stage"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                    className="surface-3d-recessed space-y-3 rounded-md p-4"
                  >
                    {visualMode === '3d' ? (
                      <AudioSpectrum3D
                        analyser={activeAnalyser}
                        active={isPlaying}
                        analyzing={loading}
                        emotion={result?.isFemaleVoice ? result.emotion : null}
                        rejected={Boolean(result && !result.isFemaleVoice)}
                      />
                    ) : (
                      <canvas
                        ref={playbackCanvasRef}
                        width={640}
                        height={96}
                        className="h-24 w-full rounded-md border border-slate-800 bg-[#090d16]"
                      />
                    )}
                    <audio
                      ref={audioElRef}
                      src={audioUrl}
                      controls
                      onPlay={handleAudioPlay}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      className="w-full"
                    />
                  </motion.div>
                ) : visualMode === '3d' ? (
                  <motion.div
                    key="3d-standby-stage"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <AudioSpectrum3D
                      analyser={null}
                      active={false}
                      analyzing={loading}
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40"
                    >
                      <p className="text-xs font-medium text-slate-800">
                        Drag &amp; drop a voice note or record directly with your microphone (Female
                        voices only)
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="drop-stage"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40"
                  >
                    <AudioLines className="h-7 w-7 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-800">
                      Drag &amp; drop a voice note or record directly with your microphone
                    </p>
                    <p className="mt-1 max-w-md text-xs text-slate-500">
                      Supported exclusively for female voices. If a non-female voice is supplied,
                      the model will prompt you to provide a female voice instead.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 3-Stage Verification Pipeline */}
              <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                {[
                  {
                    step: '01',
                    label: 'Audio Input',
                    done: Boolean(audioPayload),
                    active: recording,
                    failed: false,
                  },
                  {
                    step: '02',
                    label: 'Female Screening',
                    done: Boolean(result && result.isFemaleVoice),
                    active: loading,
                    failed: Boolean(result && !result.isFemaleVoice),
                  },
                  {
                    step: '03',
                    label: 'Emotion Result',
                    done: Boolean(result && result.isFemaleVoice),
                    active: false,
                    failed: false,
                  },
                ].map((stage) => (
                  <div key={stage.step} className="space-y-1.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{
                          scaleX: stage.done || stage.failed ? 1 : stage.active ? 0.65 : 0,
                        }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        style={{ transformOrigin: 'left' }}
                        className={`h-full w-full ${
                          stage.failed
                            ? 'bg-amber-500'
                            : stage.done
                              ? 'bg-emerald-600'
                              : 'bg-blue-600'
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-mono text-slate-400">{stage.step}</span>
                      <span
                        className={`font-medium truncate ${
                          stage.failed
                            ? 'text-amber-700'
                            : stage.done
                              ? 'text-slate-900'
                              : stage.active
                                ? 'text-blue-600'
                                : 'text-slate-500'
                        }`}
                      >
                        {stage.label}
                      </span>
                      {stage.done ? <Check className="h-3 w-3 shrink-0 text-emerald-600" /> : null}
                    </div>
                  </div>
                ))}
              </div>

              {loading ? (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-800"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Evaluating speaker voice profile &amp; emotional prosody...</span>
                </motion.div>
              ) : null}
            </div>
          </InteractiveDropZone>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <TactileCard>
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Voice &amp; Emotion Output</h3>
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
                  <Mic className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 text-xs text-slate-500">
                    Load or record an audio clip, then click{' '}
                    <span className="font-medium text-slate-700">Analyze Emotion</span>.
                  </p>
                </motion.div>
              ) : !result.isFemaleVoice ? (
                <motion.div
                  key="rejected"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 p-5"
                >
                  <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">Female Voice Required</div>
                      <p className="text-xs leading-relaxed">
                        {result.rejectionReason ||
                          'Non-female voice detected. Please upload or record a female voice note instead.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <span>Detected voice profile</span>
                    <span className="font-mono font-medium capitalize text-slate-900">
                      {result.detectedGender.replace('_', ' ')}
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="accepted"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="divide-y divide-slate-100"
                >
                  <div className="grid grid-cols-2 divide-x divide-slate-100">
                    <div className="p-4">
                      <div className="text-xs text-slate-500">Predicted Emotion</div>
                      <div className="mt-1 text-2xl font-semibold text-blue-600">
                        {result.emotion}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="text-xs text-slate-500">Confidence</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-slate-900">
                        <AnimatedNumber value={Math.round(result.confidence * 100)} suffix="%" />
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.min(1, Math.max(0.05, result.confidence)) }}
                          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                          style={{ transformOrigin: 'left' }}
                          className="h-full w-full bg-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3 text-xs">
                    <span className="text-slate-500">Voice Verification</span>
                    <span className="font-medium text-emerald-700">Female Voice Confirmed</span>
                  </div>

                  {result.transcript ? (
                    <div className="p-4">
                      <div className="text-xs font-medium text-slate-500">Transcript</div>
                      <p className="mt-1 text-sm italic text-slate-800">“{result.transcript}”</p>
                    </div>
                  ) : null}

                  {result.acousticCues.length > 0 ? (
                    <div className="p-4">
                      <div className="text-xs font-medium text-slate-500">Acoustic Cues</div>
                      <ul className="mt-2 space-y-1 text-xs text-slate-700">
                        {result.acousticCues.map((cue, idx) => (
                          <motion.li
                            key={idx}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.18, delay: idx * 0.05 }}
                          >
                            · {cue}
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </TactileCard>
        </div>
      </div>
    </div>
  );
}
