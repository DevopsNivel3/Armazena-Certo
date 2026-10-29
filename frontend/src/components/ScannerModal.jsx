import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertCircle, CheckCircle2, Flashlight, RefreshCw, ScanLine, ShieldCheck, SwitchCamera, X } from 'lucide-react';
import useKeyboardViewport from '../hooks/useKeyboardViewport';

// O PWA lê códigos de produtos. Restringir aos formatos lineares reduz o
// trabalho do decodificador por quadro e acelera a identificação.
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E
].filter((format) => format !== undefined);

const INITIAL_GUIDANCE = 'Centralize o código na faixa e mantenha o celular firme.';

function normalizeScanResult(result) {
  if (result && typeof result === 'object') {
    return {
      accepted: result.accepted !== false,
      keepOpen: Boolean(result.keepOpen),
      pause: Boolean(result.pause),
      message: result.message || ''
    };
  }
  return { accepted: result !== false, keepOpen: false, message: '' };
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Safari/iOS não oferece vibração; ela é apenas um reforço opcional.
  }
}

function guidanceFromResult(decodedResult, videoElement) {
  const points = decodedResult?.result?.resultPoints || decodedResult?.resultPoints || [];
  const videoWidth = videoElement?.videoWidth || videoElement?.clientWidth || 0;
  if (points.length < 2 || !videoWidth) return 'Código enquadrado. Validando o produto...';

  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  if (xs.length < 2) return 'Código enquadrado. Validando o produto...';

  const ratio = (Math.max(...xs) - Math.min(...xs)) / videoWidth;
  if (ratio < 0.28) return 'Código pequeno no quadro: chegue um pouco mais perto.';
  if (ratio > 0.88) return 'Código muito próximo: afaste um pouco o celular.';
  return 'Distância boa. Validando o produto...';
}

export default function ScannerModal({ isOpen, onClose, onScan, continuous = false, paused = false, children, title = 'Escanear código' }) {
  const viewportRef = useRef(null);
  useKeyboardViewport(viewportRef, isOpen);
  const [feedback, setFeedback] = useState({ type: 'scanning', message: INITIAL_GUIDANCE });
  const [currentCode, setCurrentCode] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const scannerRef = useRef(null);
  const startPromiseRef = useRef(null);
  const stopPromiseRef = useRef(Promise.resolve());
  const processingRef = useRef(false);
  const visibleCodeRef = useRef({ code: '', lastSeenAt: 0 });
  const sessionRef = useRef(0);
  const guidanceTimerRef = useRef(null);
  const readerId = useId().replace(/:/g, '');
  const onCloseRef = useRef(onClose);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const decodingPausedRef = useRef(false);
  const activeCameraIdRef = useRef('');
  pausedRef.current = paused;

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => {
    if (!paused) processingRef.current = false;
    const instance = scannerRef.current;
    if (!instance?.isScanning) return;
    try {
      if (paused && !decodingPausedRef.current) {
        instance.pause(false);
        decodingPausedRef.current = true;
      } else if (!paused && decodingPausedRef.current) {
        instance.resume();
        decodingPausedRef.current = false;
        visibleCodeRef.current.lastSeenAt = Date.now();
      }
    } catch {
      // A trava lógica continua protegendo a leitura se o navegador suspender o vídeo.
    }
  }, [paused]);

  const stopScanner = useCallback(async () => {
    sessionRef.current += 1;
    window.clearInterval(guidanceTimerRef.current);
    guidanceTimerRef.current = null;
    const instance = scannerRef.current;
    const starting = startPromiseRef.current;
    scannerRef.current = null;
    startPromiseRef.current = null;
    processingRef.current = false;
    decodingPausedRef.current = false;
    visibleCodeRef.current = { code: '', lastSeenAt: 0 };
    setTorchEnabled(false);
    setTorchSupported(false);

    const previousStop = stopPromiseRef.current;
    const stopping = (async () => {
      await previousStop.catch(() => {});
      if (starting) await starting.catch(() => {});
      if (instance) {
        try {
          if (instance.isScanning) await instance.stop();
        } catch {
          // O navegador pode encerrar a câmera antes da biblioteca.
        }
        try {
          instance.clear();
        } catch {
          // O leitor pode ainda não ter montado o vídeo.
        }
      }
    })();
    stopPromiseRef.current = stopping;
    await stopping;
  }, []);

  const close = useCallback(() => {
    void stopScanner();
    onCloseRef.current?.();
  }, [stopScanner]);

  useEffect(() => {
    if (!isOpen) {
      void stopScanner();
      return undefined;
    }

    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setFeedback({ type: 'scanning', message: INITIAL_GUIDANCE });
    setCurrentCode('');
    setIsStarting(true);
    processingRef.current = false;
    visibleCodeRef.current = { code: '', lastSeenAt: 0 };

    let hintIndex = 0;
    const hints = [
      INITIAL_GUIDANCE,
      'Código pequeno ou distante? Chegue um pouco mais perto.',
      'Imagem desfocada? Afaste levemente e mantenha o celular firme.',
      'Evite reflexos e deixe todas as barras visíveis dentro da faixa.'
    ];
    guidanceTimerRef.current = window.setInterval(() => {
      if (processingRef.current || pausedRef.current) return;
      hintIndex = (hintIndex + 1) % hints.length;
      setFeedback((current) => current.type === 'scanning'
        ? { type: 'scanning', message: hints[hintIndex] }
        : current);
    }, 2800);

    const timer = window.setTimeout(async () => {
      try {
        await stopPromiseRef.current;
        if (sessionRef.current !== session) return;
        if (!window.isSecureContext && window.location.hostname !== 'localhost') {
          throw new Error('A câmera exige acesso HTTPS neste navegador.');
        }

        let availableCameras = [];
        try {
          availableCameras = await Html5Qrcode.getCameras();
          if (sessionRef.current !== session) return;
          setCameras(availableCameras);
        } catch {
          // Alguns navegadores só listam câmeras depois que o vídeo inicia.
        }

        const cameraConfig = selectedCameraId || { facingMode: { ideal: 'environment' } };
        const instance = new Html5Qrcode(readerId, {
          formatsToSupport: SUPPORTED_FORMATS,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false
        });
        scannerRef.current = instance;

        startPromiseRef.current = instance.start(
          cameraConfig,
          {
            fps: 20,
            qrbox: (width, height) => ({
              width: Math.floor(width * 0.9),
              height: Math.min(180, Math.floor(height * 0.42))
            }),
            aspectRatio: 1.777,
            disableFlip: true
          },
          async (rawText, decodedResult) => {
            const code = String(rawText || '').trim();
            const now = Date.now();
            if (!code || sessionRef.current !== session || pausedRef.current) return;

            // O mesmo código permanece bloqueado enquanto continuar no quadro.
            const previousVisibleCode = visibleCodeRef.current.code;
            visibleCodeRef.current = { code, lastSeenAt: now };
            if (processingRef.current || previousVisibleCode === code) return;

            processingRef.current = true;
            setCurrentCode(code);
            const videoElement = document.getElementById(readerId)?.querySelector('video');
            setFeedback({ type: 'validating', message: guidanceFromResult(decodedResult, videoElement) });
            vibrate(35);

            try {
              const response = normalizeScanResult(await onScanRef.current?.(code));
              if (sessionRef.current !== session) return;
              if (response.pause) pausedRef.current = true;
              if (!response.accepted) {
                setFeedback({
                  type: 'error',
                  message: response.message || 'Produto não encontrado. Retire o código do quadro e tente novamente.'
                });
                vibrate([80, 70, 120]);
                return;
              }

              setFeedback({ type: 'success', message: response.message || `Código ${code} confirmado.` });
              vibrate([45, 45, 90]);
              if (!response.keepOpen) {
                processingRef.current = true;
                window.setTimeout(() => { if (sessionRef.current === session) close(); }, 120);
              }
            } catch (scanError) {
              setFeedback({
                type: 'error',
                message: scanError?.message || 'Não foi possível validar o código. Retire-o do quadro e tente novamente.'
              });
              vibrate([80, 70, 120]);
            } finally {
              if (sessionRef.current === session && !pausedRef.current) processingRef.current = false;
            }
          },
          () => {
            const visible = visibleCodeRef.current;
            if (!pausedRef.current && !processingRef.current && visible.code && Date.now() - visible.lastSeenAt > 650) {
              visibleCodeRef.current = { code: '', lastSeenAt: 0 };
              setCurrentCode('');
              setFeedback((current) => current.type === 'validating'
                ? current
                : { type: 'scanning', message: 'Pronto para a próxima leitura.' });
            }
          }
        );
        await startPromiseRef.current;

        if (sessionRef.current !== session) {
          return;
        }

        try {
          activeCameraIdRef.current = instance.getRunningTrackSettings?.().deviceId || selectedCameraId;
          const capabilities = instance.getRunningTrackCapabilities?.() || {};
          setTorchSupported(Boolean(capabilities.torch));
          if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
            await instance.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }
        } catch {
          // Foco contínuo e lanterna são melhorias opcionais.
        }
      } catch (startError) {
        if (sessionRef.current !== session) return;
        console.error('Erro ao iniciar a câmera:', startError);
        const message = startError?.message || '';
        setFeedback({
          type: 'error',
          message: message.includes('HTTPS')
            ? message
            : 'Não foi possível abrir a câmera. Libere a permissão ou use o leitor/digitação manual.'
        });
      } finally {
        if (sessionRef.current === session) setIsStarting(false);
      }
    }, 50);

    return () => {
      window.clearTimeout(timer);
      void stopScanner();
    };
  }, [isOpen, readerId, selectedCameraId, stopScanner, close, continuous]);

  const toggleTorch = async () => {
    const instance = scannerRef.current;
    if (!instance || !torchSupported) return;
    const nextValue = !torchEnabled;
    try {
      await instance.applyVideoConstraints({ advanced: [{ torch: nextValue }] });
      setTorchEnabled(nextValue);
    } catch {
      setTorchSupported(false);
      setFeedback({ type: 'error', message: 'A lanterna não está disponível nesta câmera.' });
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((camera) => camera.id === activeCameraIdRef.current);
    const nextCamera = cameras[(currentIndex + 1 + cameras.length) % cameras.length];
    setSelectedCameraId(nextCamera.id);
  };

  if (!isOpen) return null;

  const feedbackStyles = {
    scanning: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    validating: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-rose-200 bg-rose-50 text-rose-700'
  };
  const frameStyles = {
    scanning: 'border-cyan-400',
    validating: 'border-amber-400',
    success: 'border-emerald-400',
    error: 'border-rose-400'
  };

  return (
    <div ref={viewportRef} className="fixed inset-x-0 top-[var(--keyboard-viewport-top,0px)] z-[60] flex h-[var(--keyboard-viewport-height,100dvh)] flex-col items-center justify-center overflow-hidden bg-slate-950/80 p-0 backdrop-blur-sm md:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="relative flex h-full max-h-full w-full flex-col overflow-hidden bg-white shadow-2xl md:h-auto md:max-w-lg md:rounded-[28px]">
        <div className="border-b border-slate-100 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Leitura por câmera</p>
              <h3 className="mt-1 truncate text-xl font-bold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-500">{continuous ? 'Leia o código e informe a quantidade.' : 'Aponte para o código; a captura é automática.'}</p>
            </div>
            <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600" aria-label="Fechar câmera">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-slate-50 p-3 sm:p-5">
          <div className={`mb-3 flex min-h-[58px] items-start gap-3 rounded-2xl border p-3 ${feedbackStyles[feedback.type]}`} role={feedback.type === 'error' ? 'alert' : 'status'} aria-live="polite">
            {feedback.type === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <ScanLine className={`mt-0.5 h-5 w-5 shrink-0 ${feedback.type === 'validating' ? 'animate-pulse' : ''}`} />}
            <div className="min-w-0">
              <p className="text-sm font-semibold">{feedback.message}</p>
              {currentCode && <p className="mt-1 break-all font-mono text-xs font-bold">Leitura atual: {currentCode}</p>}
            </div>
          </div>

          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-[24px] bg-slate-950 shadow-xl sm:min-h-[400px]">
            <div id={readerId} className="h-full min-h-[280px] w-full sm:min-h-[400px]" />
            <div className={`pointer-events-none absolute inset-x-[5%] top-1/2 z-20 h-36 -translate-y-1/2 rounded-2xl border-[3px] transition-colors duration-150 ${frameStyles[feedback.type]} shadow-[0_0_0_999px_rgba(2,6,23,0.2)]`}>
              <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-white/80" />
            </div>
            {isStarting && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-950/75 text-white">
                <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
                <p className="text-sm font-semibold">Preparando câmera...</p>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={toggleTorch} disabled={!torchSupported} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40">
              <Flashlight className="h-4 w-4" /> {torchEnabled ? 'Apagar luz' : 'Acender luz'}
            </button>
            <button type="button" onClick={switchCamera} disabled={cameras.length < 2} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40">
              <SwitchCamera className="h-4 w-4" /> Trocar câmera
            </button>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-xl bg-white px-3 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>Boa luz e todas as barras visíveis deixam a leitura mais rápida. No iPhone, a vibração pode não estar disponível.</span>
          </div>
        </div>
        {children && <div className="absolute inset-0 z-40 flex min-h-0 items-end overflow-hidden bg-slate-950/45 pt-3">{children}</div>}
      </div>
    </div>
  );
}
