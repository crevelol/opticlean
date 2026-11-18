import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type Props = {
  onDetect: (code: string) => void;
  onClose: () => void;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

/** QR + códigos de barras habituales en productos/etiquetas de bodega. */
const SCAN_FORMATS = [
  'qr_code',
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
  'data_matrix',
] as const;

export function QrScanner({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [cameraOk, setCameraOk] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let detector: BarcodeDetectorLike | null = null;

    const run = async () => {
      try {
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;
        if (Detector) {
          try {
            detector = new Detector({ formats: [...SCAN_FORMATS] });
          } catch {
            // Algunos navegadores no aceptan todos los formatos
            detector = new Detector({
              formats: ['qr_code', 'code_128', 'ean_13', 'code_39', 'upc_a'],
            });
          }
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraOk(true);

        const tick = async () => {
          if (stopped.current || !videoRef.current) return;
          if (detector && videoRef.current.readyState >= 2) {
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes[0]?.rawValue?.trim();
              if (value) {
                onDetect(value);
                return;
              }
            } catch {
              /* keep scanning */
            }
          }
          timer = window.setTimeout(() => void tick(), 280);
        };
        void tick();
        if (!detector) {
          setError(
            'Este navegador no lee códigos por cámara. Usa un lector USB/Bluetooth o escribe el código.',
          );
          window.setTimeout(() => inputRef.current?.focus(), 120);
        }
      } catch {
        setError('No se pudo abrir la cámara. Usa un lector de código o escribe el SKU.');
        window.setTimeout(() => inputRef.current?.focus(), 120);
      }
    };

    void run();
    return () => {
      stopped.current = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="scan-sheet">
      <header>
        <strong>Leer código</strong>
        <button type="button" className="icon-btn light" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </header>
      <div className={`scan-frame${cameraOk ? '' : ' is-offline'}`}>
        <video ref={videoRef} muted playsInline />
        <div className="scan-reticle scan-reticle-barcode" aria-hidden />
      </div>
      {error ? (
        <p className="scan-error">{error}</p>
      ) : (
        <p className="scan-help">
          Apunta al <strong>código de barras</strong> o QR del producto. También puedes usar un
          lector USB/Bluetooth.
        </p>
      )}
      <form
        className="scan-manual"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onDetect(manual.trim());
        }}
      >
        <input
          ref={inputRef}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Código de barras / SKU / QR"
          autoCapitalize="characters"
          autoComplete="off"
          enterKeyHint="done"
          inputMode="text"
        />
        <button type="submit" className="btn primary">
          Usar código
        </button>
      </form>
    </div>
  );
}
