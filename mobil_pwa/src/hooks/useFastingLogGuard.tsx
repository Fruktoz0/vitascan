import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { fastingApi } from '../services/api';

export function useFastingLogGuard() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<{ resolve: (end: boolean) => void } | null>(null);

  const confirmIfActive = useCallback(async () => {
    let active = false;
    try {
      const current = await fastingApi.current();
      active = Boolean(current.active);
    } catch {
      return;
    }
    if (!active) return;

    const shouldEnd = await new Promise<boolean>((resolve) => {
      setPending({ resolve });
    });
    if (shouldEnd) {
      try {
        await fastingApi.stop();
      } catch {
        /* keep logging even if stop fails */
      }
    }
  }, []);

  const dialog = (
    <ConfirmDialog
      visible={!!pending}
      title={t('fasting.endOnLogTitle')}
      message={t('fasting.endOnLogMessage')}
      confirmLabel={t('fasting.endFast')}
      cancelLabel={t('fasting.keepFast')}
      onConfirm={() => {
        pending?.resolve(true);
        setPending(null);
      }}
      onClose={() => {
        pending?.resolve(false);
        setPending(null);
      }}
    />
  );

  return { confirmIfActive, dialog };
}
