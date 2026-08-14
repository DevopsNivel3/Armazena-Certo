import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertCircle, CheckCircle2, Flashlight, RefreshCw, ScanLine, ShieldCheck, SwitchCamera, X } from 'lucide-react';

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX
].filter((format) => format !== undefined);

function normalizeScanResult(result) {
  if (result && typeof result === 'object') {
    return {
      accepted: result.accepted !== false,
      keepOpen: Boolean(result.keepOpen),
      message: result.message || ''
    };
  }

  return { accepted: result !== false, keepOpen: false, message: '' };
}

export default function ScannerModal({ isOpen, onClose, onScan, continuous = false, title = 'Escanear código' }) {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const lastScanRef = useRef({ code: '', at: 0 });
  const sessionRef = useRef(0);
  const readerId = useId().replace(/:/g, '');
  const onCloseRef = useRef(onClose);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopScanner = useCallback(async () => {
    sessionRef.current += 1;
    const instance = scannerRef.current;
    scannerRef.current = null;
    processingRef.current = false;
    setTorchEnabled(false);
    setTorchSupported(false);

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
    setError('');
    setStatus('');
    setIsStarting(true);
    processingRef.current = false;
    lastScanRef.current = { code: '', at: 0 };

    const timer = window.setTimeout(async () => {
      try {
        if (!window.isSecureContext && window.location.hostname !== 'localhost') {
          throw new Error('A câmera exige acesso HTTPS neste navegador.');
        }

        let availableCameras = [];
        try {
          availableCameras = await Html5Qrcode.getCameras();
          if (sessionRef.current !== session) return;
          setCameras(availableCameras);
        } catch {
          // Alguns navegadores só listam as câmeras depois que o vídeo inicia.
        }

        const preferredCamera = selectedCameraId
          || availableCameras.find((camera) => /back|rear|traseira|environment/i.test(camera.label))?.id
          || availableCameras.at(-1)?.id;
        const cameraConfig = preferredCamera || { facingMode: { ideal: 'environment' } };
        const instance = new Html5Qrcode(readerId, { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
        scannerRef.current = instance;

        await instance.start(
          cameraConfig,
          { fps: 20, aspectRatio: 1.777, disableFlip: false },
          async (rawText) => {
            const code = String(rawText || '').trim();
            const now = Date.now();
            if (!code || processingRef.current) return;
            if (lastScanRef.current.code === code && now - lastScanRef.current.at < 1400) return;

            processingRef.current = true;
            lastScanRef.current = { code, at: now };
            setError('');
            setStatus('Validando leitura...');

            try {
              const response = normalizeScanResult(await onScanRef.current?.(code));
              if (!response.accepted) {
                setError(response.message || 'Código lido, mas o produto não foi encontrado. Tente novamente.');
                setStatus('');
                return;
              }

              setStatus(response.message || `Código ${code} confirmado.`);
              if (!continuous && !response.keepOpen) close();
            } catch (scanError) {
              setError(scanError?.message || 'Não foi possível validar o código lido. Tente novamente.');
              setStatus('');
            } finally {
              window.setTimeout(() => {
                processingRef.current = false;
              }, 450);
            }
          },
          () => {}
        );

        if (sessionRef.current !== session) {
          await stopScanner();
          return;
        }

        try {
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
        setError(message.includes('HTTPS')
          ? message
          : 'Não foi possível abrir a câmera. Libere a permissão ou use o leitor/digitação manual.');
      } finally {
        if (sessionRef.current === session) setIsStarting(false);
      }
    }, 80);

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
      setError('A lanterna não está disponível nesta câmera.');
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((camera) => camera.id === selectedCameraId);
    const nextCamera = cameras[(currentIndex + 1 + cameras.length) % cameras.length];
    setSelectedCameraId(nextCamera.id);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/80 p-0 backdrop-blur-sm md:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-full h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl md:h-auto md:max-h-[94dvh] md:max-w-lg md:rounded-[28px]">
        <div className="border-b border-slate-100 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Leitura por câmera</p>
              <h3 className="mt-1 truncate text-xl font-bold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-500">{continuous ? 'Leitura contínua ativa. Aponte para o próximo item.' : 'Aponte para o código; a captura é automática.'}</p>
            </div>
            <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600" aria-label="Fechar câmera">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-slate-50 p-3 sm:p-5">
          {error && (
            <div className="mb-3 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700" role="alert">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
          {status && !error && (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800" aria-live="polite">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="min-w-0 truncate text-sm font-semibold">{status}</p>
            </div>
          )}

          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-[24px] bg-slate-950 shadow-xl sm:min-h-[400px]">
            <div id={readerId} className="h-full min-h-[280px] w-full sm:min-h-[400px]" />
            <div className="pointer-events-none absolute inset-x-[8%] top-1/2 z-20 h-32 -translate-y-1/2 rounded-2xl border-2 border-cyan-400 shadow-[0_0_0_999px_rgba(2,6,23,0.22)]">
              <div className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-cyan-300/80" />
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
            <span><ScanLine className="mr-1 inline h-4 w-4" />Boa luz e código inteiro no quadro aceleram a leitura. Se a câmera falhar, feche e use o campo manual.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
