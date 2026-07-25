import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useTranslation } from 'react-i18next';
import { IconFlashlight, IconFlashlightOff, IconKeyboardOutline } from '../components/ui/Icons';
import { AddFoodManualModal, FoodDetailModal } from '../components/food/FoodModals';
import { ApiError, foodApi, type Food } from '../services/api';
import styles from './ScannerPage.module.css';

type ScanState = 'idle' | 'scanning' | 'found' | 'not_found' | 'error';

export default function ScannerPage() {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastBarcode = useRef('');
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [foundFood, setFoundFood] = useState<Food | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const busy = useRef(false);

  const handleBarcode = useCallback(async (barcode: string) => {
    if (busy.current || barcode === lastBarcode.current) return;
    busy.current = true;
    lastBarcode.current = barcode;
    setScanState('scanning');
    try {
      const food = await foodApi.getByBarcode(barcode);
      setFoundFood(food);
      setScanState('found');
      setDetailVisible(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setScanState('not_found');
        setManualVisible(true);
      } else {
        setScanState('error');
        setErrorMsg(err instanceof ApiError ? err.message : t('unknownError'));
      }
    } finally {
      setTimeout(() => {
        busy.current = false;
        if (!detailVisible && !manualVisible) {
          setScanState('idle');
          lastBarcode.current = '';
        }
      }, 1500);
    }
  }, [detailVisible, manualVisible, t]);

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        setPermission('granted');
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(!!caps?.torch);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;
        reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, controls) => {
          if (!active) {
            controls.stop();
            return;
          }
          if (result && !detailVisible && !manualVisible) {
            handleBarcode(result.getText());
          }
        });
      } catch {
        if (active) setPermission('denied');
      }
    };

    if (!detailVisible && !manualVisible) start();

    return () => {
      active = false;
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((tr) => tr.stop());
      readerRef.current = null;
    };
  }, [detailVisible, manualVisible, handleBarcode]);

  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {}
  };

  if (permission === 'denied') {
    return (
      <div className={`${styles.screen} page-scroll`}>
        <div className={styles.centerMsg}>
          <h2>{t('scannerScreen.cameraDenied')}</h2>
          <p>{t('scannerScreen.cameraDeniedHint')}</p>
          <button type="button" className={styles.manualCta} onClick={() => setManualVisible(true)}>
            <IconKeyboardOutline size={26} /> {t('food.addManual')}
          </button>
        </div>
        <AddFoodManualModal visible={manualVisible} onClose={() => setManualVisible(false)} onCreated={(f) => { setFoundFood(f); setDetailVisible(true); }} />
        <FoodDetailModal
          food={foundFood}
          visible={detailVisible}
          onClose={() => setDetailVisible(false)}
          onLogAdded={() => {
            setDetailVisible(false);
            setManualVisible(false);
          }}
          logSource="MANUAL"
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <video ref={videoRef} className={styles.video} playsInline muted />
      <div className={styles.overlay}>
        <div className={styles.topBar}>
          <h1 className={styles.title}>{t('scanner')}</h1>
          {torchSupported && (
            <button type="button" className={`${styles.torchBtn} ${torchOn ? styles.torchOn : ''}`} onClick={toggleTorch}>
              {torchOn ? <IconFlashlightOff size={22} /> : <IconFlashlight size={22} />}
            </button>
          )}
        </div>

        <div className={styles.frame}>
          <div className={styles.scanLine} />
        </div>

        <p className={styles.hint}>
          {scanState === 'scanning' && t('scannerScreen.lookingUp')}
          {scanState === 'idle' && t('scannerScreen.pointAtBarcode')}
          {scanState === 'error' && errorMsg}
          {scanState === 'not_found' && t('scannerScreen.notFound')}
        </p>

        <button type="button" className={styles.manualCta} onClick={() => setManualVisible(true)}>
          <IconKeyboardOutline size={26} /> {t('food.addManual')}
        </button>
      </div>

      <FoodDetailModal
        food={foundFood}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          if (!manualVisible) {
            setScanState('idle');
            lastBarcode.current = '';
          }
        }}
        onLogAdded={() => {
          setDetailVisible(false);
          setManualVisible(false);
          setScanState('idle');
          lastBarcode.current = '';
        }}
        logSource="SCAN"
      />
      <AddFoodManualModal
        visible={manualVisible}
        onClose={() => {
          setManualVisible(false);
          setScanState('idle');
          lastBarcode.current = '';
        }}
        onCreated={(f) => {
          setFoundFood(f);
          setDetailVisible(true);
        }}
      />
    </div>
  );
}
