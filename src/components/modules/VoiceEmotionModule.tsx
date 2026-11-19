import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, AudioLines, Loader2, Mic, Sparkles, Square, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { VoiceEmotionResult } from '../../types/vision';
import { fileToBase64 } from '../../utils/media';
import { AnimatedNumber } from '../AnimatedNumber';
import { InteractiveDropZone } from '../InteractiveDropZone';

export function VoiceEmotionModule() {
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

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barCount = 48;
      const step = Math.max(1, Math.floor(bufferLength / barCount));
      const barWidth = canvas.width / barCount - 3;

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barH = Math.max(4, val * (canvas.height - 16));
        const x = i * (barWidth + 3) + 1.5;
        const y = canvas.height - barH - 6;
        ctx.fillStyle = val > 0.65 ? '#60a5fa' : '#2563eb';
        ctx.fillRect(x, y, barWidth, barH);
      }
    };
    render();
  };

  const handleAudioPlay = () => {
    const audioEl = audioElRef.current;
    const canvas = playbackCanvasRef.current;
    if (!audioEl || !canvas) return;

    if (!playbackCtxRef.current) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audioEl);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      playbackCtxRef.current = ctx;
      playbackSourceRef.current = source;
      drawFrequencyBars(analyser, canvas, playbackFrameRef);
    } else if (playbackCtxRef.current.state === 'suspended') {
      playbackCtxRef.current.resume().catch(() => {});
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
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3b82f6';
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
      drawWaveform(analyser);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stopVisualizer();
        stream.getTracks().forEach((t) => t.stop());
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
      recorder.start();
    } catch (err) {
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
      setResult(data as VoiceEmotionResult);
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
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Voice Note
          </motion.button>

          {!recording ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleStartRecording}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Mic className="h-3.5 w-3.5 text-red-600" />
              Record Voice
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleStopRecording}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 whitespace-nowrap"
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
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
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
            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="text-xs font-medium text-slate-500">Audio Input Source</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900">{audioLabel}</div>
                </div>
                <div className="text-xs text-slate-500">WAV · MP3 · OGG · WebM · M4A</div>
              </div>

              {recording ? (
                <div className="space-y-2">
                  <canvas
                    ref={canvasRef}
                    width={640}
                    height={140}
                    className="h-36 w-full rounded-md border border-slate-800 bg-slate-950"
                  />
                  <p className="text-xs font-mono tabular-nums text-red-600">
                    Recording live microphone input ({recordSeconds}s)... Speak naturally, then
                    click Stop.
                  </p>
                </div>
              ) : audioUrl ? (
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <canvas
                    ref={playbackCanvasRef}
                    width={640}
                    height={96}
                    className="h-24 w-full rounded-md border border-slate-800 bg-slate-950"
                  />
                  <audio
                    ref={audioElRef}
                    src={audioUrl}
                    controls
                    onPlay={handleAudioPlay}
                    className="w-full"
                  />
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40"
                >
                  <AudioLines className="h-7 w-7 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    Drag &amp; drop a voice note or record directly with your microphone
                  </p>
                  <p className="mt-1 max-w-md text-xs text-slate-500">
                    Supported exclusively for female voices. If a non-female voice is supplied, the
                    model will prompt you to provide a female voice instead.
                  </p>
                </div>
              )}

              {loading ? (
                <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-800">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Evaluating speaker voice profile &amp; emotional prosody...</span>
                </div>
              ) : null}
            </div>
          </InteractiveDropZone>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-lg border border-slate-200 bg-white">
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
          </div>
        </div>
      </div>
    </div>
  );
}
