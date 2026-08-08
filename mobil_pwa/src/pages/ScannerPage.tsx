import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { useTranslation } from 'react-i18next';
import { IconFlashlight, IconFlashlightOff, IconKeyboardOutline, IconScreenRotation } from '../components/ui/Icons';
import { FoodDetailModal } from '../components/food/FoodModals';
import { ApiError, foodApi, type Food } from '../services/api';
import styles from './ScannerPage.module.css';

type ScanState = 'idle' | 'scanning' | 'found' | 'not_found' | 'error';
type FrameOrientation = 'landscape' | 'portrait';

type ScannerLocationState = {
  returnPath?: string;
};

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  focusMode?: string[];
  zoom?: { min: number; max: number; step?: number };
  pointsOfInterest?: boolean;
};

type ExtendedConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  focusMode?: string;
  zoom?: number;
  pointsOfInterest?: { x: number; y: number }[];
};

async function applyCameraEnhancements(track: MediaStreamTrack): Promise<{
  torchSupported: boolean;
  tapFocusSupported: boolean;
}> {
  const caps = track.getCapabilities?.() as ExtendedCapabilities | undefined;
  if (!caps) return { torchSupported: false, tapFocusSupported: false };

  const advanced: ExtendedConstraintSet[] = [];

  if (caps.focusMode?.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' });
  }

  if (caps.zoom) {
    const { min, max } = caps.zoom;
    const preferred = Math.min(max, Math.max(min, Math.min(2, min + (max - min) * 0.35)));
    if (preferred > min) {
      advanced.push({ zoom: preferred });
    }
  }

  if (advanced.length > 0) {
    try {
      await track.applyConstraints({ advanced: advanced as MediaTrackConstraintSet[] });
    } catch {
      /* capability advertised but rejected */
    }
  }

  const tapFocusSupported =
    !!caps.pointsOfInterest ||
    !!caps.focusMode?.includes('single-shot') ||
    !!caps.focusMode?.includes('manual');

  return { torchSupported: !!caps.torch, tapFocusSupported };
}

export default function ScannerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastBarcode = useRef('');
  const detailVisibleRef = useRef(false);
  const busy = useRef(false);
  const navigatingAway = useRef(false);
  const focusRestoreTimer = useRef<number | null>(null);

  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [foundFood, setFoundFood] = useState<Food | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [tapFocusSupported, setTapFocusSupported] = useState(false);
  const [frameOrientation, setFrameOrientation] = useState<FrameOrientation>('landscape');

  const returnPath =
    (location.state as ScannerLocationState | null)?.returnPath || '/home';

  const stopCamera = useCallback(() => {
    if (focusRestoreTimer.current != null) {
      window.clearTimeout(focusRestoreTimer.current);
      focusRestoreTimer.current = null;
    }
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;

    const fromVideo = videoRef.current?.srcObject as MediaStream | null;
    const streams = [streamRef.current, fromVideo].filter(Boolean) as MediaStream[];
    for (const s of streams) {
      s.getTracks().forEach((tr) => {
        try {
          tr.stop();
        } catch {
          /* ignore */
        }
      });
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    readerRef.current = null;
    setTorchOn(false);
  }, []);

  const goToAddFood = useCallback(
    (opts?: { productNotFound?: boolean; barcode?: string }) => {
      navigatingAway.current = true;
      stopCamera();
      if (opts?.productNotFound) {
        navigate(returnPath, {
          replace: true,
          state: {
            productNotFound: true,
            ...(opts.barcode ? { prefillBarcode: opts.barcode } : {}),
          },
        });
        return;
      }
      navigate(returnPath, {
        replace: true,
        state: { openAddFood: true },
      });
    },
    [navigate, returnPath, stopCamera],
  );

  const handleBarcode = useCallback(
    async (barcode: string) => {
      if (busy.current || barcode === lastBarcode.current || detailVisibleRef.current) return;
      busy.current = true;
      lastBarcode.current = barcode;
      setScanState('scanning');
      try {
        const food = await foodApi.getByBarcode(barcode);
        setFoundFood(food);
        setScanState('found');
        detailVisibleRef.current = true;
        setDetailVisible(true);
        stopCamera();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setScanState('not_found');
          goToAddFood({ productNotFound: true, barcode });
          return;
        }
        setScanState('error');
        setErrorMsg(err instanceof ApiError ? err.message : t('unknownError'));
        setTimeout(() => {
          busy.current = false;
          if (!detailVisibleRef.current) {
            setScanState('idle');
            lastBarcode.current = '';
          }
        }, 1500);
        return;
      } finally {
        // found path keeps busy until detail closes; 404 navigates away
      }
      // found: keep busy until modal closes so we don't re-scan
    },
    [goToAddFood, stopCamera, t],
  );

  useEffect(() => {
    detailVisibleRef.current = detailVisible;
  }, [detailVisible]);

  useEffect(() => {
    if (detailVisible) return;

    let active = true;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        setPermission('granted');
        const track = stream.getVideoTracks()[0];
        if (track) {
          const enhanced = await applyCameraEnhancements(track);
          if (!active) return;
          setTorchSupported(enhanced.torchSupported);
          setTapFocusSupported(enhanced.tapFocusSupported);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;
        // Reuse the already-opened stream to avoid a second camera session
        await reader.decodeFromStream(stream, videoRef.current!, (result, _err, controls) => {
          controlsRef.current = controls;
          if (!active) {
            controls.stop();
            return;
          }
          if (result && !detailVisibleRef.current) {
            handleBarcode(result.getText());
          }
        });
      } catch {
        if (active) setPermission('denied');
      }
    };

    start();

    return () => {
      active = false;
      stopCamera();
    };
  }, [detailVisible, handleBarcode, stopCamera]);

  const toggleTorch = async () => {
    const stream = streamRef.current ?? (videoRef.current?.srcObject as MediaStream | null);
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as ExtendedConstraintSet as MediaTrackConstraintSet],
      });
      setTorchOn(!torchOn);
    } catch {
      /* torch unsupported */
    }
  };

  const handleTapFocus = useCallback(
    async (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!tapFocusSupported) return;
      const stream = streamRef.current ?? (videoRef.current?.srcObject as MediaStream | null);
      const track = stream?.getVideoTracks()[0];
      const video = videoRef.current;
      if (!track || !video) return;

      const rect = video.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

      if (focusRestoreTimer.current != null) {
        window.clearTimeout(focusRestoreTimer.current);
        focusRestoreTimer.current = null;
      }

      try {
        await track.applyConstraints({
          advanced: [
            {
              pointsOfInterest: [{ x, y }],
              focusMode: 'single-shot',
            } as ExtendedConstraintSet as MediaTrackConstraintSet,
          ],
        });
      } catch {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as ExtendedConstraintSet as MediaTrackConstraintSet],
          });
        } catch {
          /* ignore */
        }
        return;
      }

      focusRestoreTimer.current = window.setTimeout(() => {
        focusRestoreTimer.current = null;
        void track
          .applyConstraints({
            advanced: [{ focusMode: 'continuous' } as ExtendedConstraintSet as MediaTrackConstraintSet],
          })
          .catch(() => {
            /* ignore */
          });
      }, 2000);
    },
    [tapFocusSupported],
  );

  if (permission === 'denied') {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <div className={styles.centerMsg}>
          <h2>{t('scannerScreen.cameraDenied')}</h2>
          <p>{t('scannerScreen.cameraDeniedHint')}</p>
          <button type="button" className={styles.manualCta} onClick={() => goToAddFood()}>
            <IconKeyboardOutline size={26} /> {t('food.addManual')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <video ref={videoRef} className={styles.video} playsInline muted />
      <div className={styles.overlay}>
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.torchBtn}
            onClick={() =>
              setFrameOrientation((prev) => (prev === 'landscape' ? 'portrait' : 'landscape'))
            }
            aria-label={
              frameOrientation === 'landscape'
                ? t('scannerScreen.switchToPortrait')
                : t('scannerScreen.switchToLandscape')
            }
          >
            <IconScreenRotation size={22} />
          </button>
          {torchSupported ? (
            <button
              type="button"
              className={`${styles.torchBtn} ${torchOn ? styles.torchOn : ''}`}
              onClick={toggleTorch}
            >
              {torchOn ? <IconFlashlightOff size={22} /> : <IconFlashlight size={22} />}
            </button>
          ) : null}
        </div>

        <div
          className={`${styles.frame} ${frameOrientation === 'portrait' ? styles.framePortrait : ''} ${tapFocusSupported ? styles.frameTap : ''}`}
          onPointerDown={handleTapFocus}
          role={tapFocusSupported ? 'button' : undefined}
          aria-label={tapFocusSupported ? t('scannerScreen.tapToFocus') : undefined}
        >
          <div
            className={`${styles.scanLine} ${frameOrientation === 'portrait' ? styles.scanLineVertical : ''}`}
          />
        </div>

        <p className={styles.hint}>
          {scanState === 'scanning' && t('scannerScreen.lookingUp')}
          {scanState === 'idle' && t('scannerScreen.pointAtBarcode')}
          {scanState === 'error' && errorMsg}
          {scanState === 'not_found' && t('scannerScreen.notFound')}
        </p>

        <button type="button" className={styles.manualCta} onClick={() => goToAddFood()}>
          <IconKeyboardOutline size={26} /> {t('food.addManual')}
        </button>
      </div>

      <FoodDetailModal
        food={foundFood}
        visible={detailVisible}
        onClose={() => {
          if (navigatingAway.current) return;
          setDetailVisible(false);
          detailVisibleRef.current = false;
          setScanState('idle');
          lastBarcode.current = '';
          busy.current = false;
        }}
        onLogAdded={() => {
          navigatingAway.current = true;
          stopCamera();
          navigate(returnPath, { replace: true });
        }}
        logSource="SCAN"
      />
    </div>
  );
}
