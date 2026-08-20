import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Colors } from '../design/tokens';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  IconArrowBack,
  IconPeopleOutline,
  IconShoppingBasket,
} from '../components/ui/Icons';
import { getItem, setItem } from '../services/storage';
import {
  getErrorMessage,
  sharesApi,
  type ShareCategory,
  type ShareDto,
  type ShareLiveItem,
} from '../services/api';
import { useShareInbox } from '../stores/shareInbox';
import { useCartStore } from '../stores/cartStore';
import styles from './SharingPage.module.css';

const ALL_CATEGORIES: ShareCategory[] = ['FOOD', 'WEIGHT', 'WATER', 'BODY', 'CART', 'MEAL_PLAN'];
const ABOUT_KEY = 'vitascan.sharing.aboutCollapsed';

export default function SharingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refreshInbox = useShareInbox((s) => s.refresh);
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState<ShareCategory[]>(['CART']);
  const [shares, setShares] = useState<ShareDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [liveCat, setLiveCat] = useState<Exclude<ShareCategory, 'CART'> | null>(null);
  const [liveItems, setLiveItems] = useState<ShareLiveItem[]>([]);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState<boolean | null>(null);

  useEffect(() => {
    void getItem(ABOUT_KEY).then((raw) => {
      setAboutOpen(raw !== '1');
    });
  }, []);

  const toggleAbout = () => {
    setAboutOpen((open) => {
      const next = open !== true ? true : false;
      void setItem(ABOUT_KEY, next ? '0' : '1');
      return next;
    });
  };

  const load = useCallback(async () => {
    const data = await sharesApi.list();
    setShares(data.shares);
    await refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, t('sharing.loadError')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, t]);

  useEffect(() => {
    if (!liveId || !liveCat) {
      setLiveItems([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await sharesApi.live(liveId, liveCat);
        if (!cancelled) setLiveItems(data.items);
      } catch {
        if (!cancelled) setLiveItems([]);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveId, liveCat]);

  const outgoing = useMemo(() => shares.filter((s) => s.direction === 'outgoing'), [shares]);
  const incomingPending = useMemo(
    () => shares.filter((s) => s.direction === 'incoming' && s.status === 'PENDING'),
    [shares],
  );
  const incomingActive = useMemo(
    () => shares.filter((s) => s.direction === 'incoming' && s.status === 'ACTIVE'),
    [shares],
  );

  const toggleCat = (cat: ShareCategory) => {
    setPicked((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const handleInvite = async () => {
    setError(null);
    if (!email.trim() || picked.length === 0) return;
    setSaving(true);
    try {
      await sharesApi.create({ email: email.trim(), categories: picked });
      setEmail('');
      await load();
      void useCartStore.getState().refreshFromServer();
    } catch (err) {
      setError(getErrorMessage(err, t('sharing.inviteError')));
    } finally {
      setSaving(false);
    }
  };

  const categoryLabel = (cat: ShareCategory) => t(`sharing.cat.${cat}`);

  return (
    <div className={`${styles.screen} page-scroll`}>
      <div className={`${styles.blob} ${styles.blobMint}`} />
      <div className={`${styles.blob} ${styles.blobPeach}`} />

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate('/menu')}>
          <IconArrowBack size={22} color={Colors.dashboard.stroke} />
        </button>
        <h1>{t('sharing.title')}</h1>
        {aboutOpen === false ? (
          <button
            type="button"
            className={styles.infoBtn}
            onClick={toggleAbout}
            aria-expanded="false"
            aria-label={t('sharing.aboutToggle')}
          >
            i
          </button>
        ) : (
          <span className={styles.headerSpacer} aria-hidden />
        )}
      </header>

      <div className={styles.content}>
        {aboutOpen === true ? (
          <div className={styles.aboutCard}>
            <span className={styles.aboutShadow} />
            <div className={styles.aboutInner}>
              <div className={styles.aboutHead}>
                <h2 className={styles.aboutTitle}>{t('sharing.aboutTitle')}</h2>
                <button
                  type="button"
                  className={styles.infoBtn}
                  onClick={toggleAbout}
                  aria-expanded="true"
                  aria-label={t('sharing.aboutToggle')}
                >
                  i
                </button>
              </div>
              <p className={styles.aboutBody}>{t('sharing.lead')}</p>
            </div>
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardHeadIcon}>
              <IconPeopleOutline size={18} color={Colors.dashboard.stroke} />
            </span>
            <div>
              <h2 className={styles.cardTitle}>{t('sharing.inviteTitle')}</h2>
              <p className={styles.cardSub}>{t('sharing.inviteHint')}</p>
            </div>
          </div>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('sharing.emailPlaceholder')}
            autoComplete="email"
          />
          <div className={styles.chips}>
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`${styles.chip} ${picked.includes(cat) ? styles.chipOn : ''}`}
                onClick={() => toggleCat(cat)}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.primary}
            disabled={saving || !email.trim() || picked.length === 0}
            onClick={() => void handleInvite()}
          >
            {saving ? t('common.loading') : t('sharing.send')}
          </button>
        </div>

        {loading ? (
          <div className={styles.center}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            {incomingPending.length > 0 ? (
              <section>
                <h3 className={styles.sectionTitle}>{t('sharing.incomingPending')}</h3>
                {incomingPending.map((share) => (
                  <div key={share.id} className={styles.card}>
                    <p className={styles.shareName}>{share.owner.username}</p>
                    <p className={styles.shareMeta}>{share.owner.email}</p>
                    <p className={styles.shareCats}>{share.categories.map(categoryLabel).join(' · ')}</p>
                    <div className={styles.rowBtns}>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={async () => {
                          await sharesApi.accept(share.id);
                          await load();
                          void useCartStore.getState().refreshFromServer();
                        }}
                      >
                        {t('sharing.accept')}
                      </button>
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={async () => {
                          await sharesApi.decline(share.id);
                          await load();
                        }}
                      >
                        {t('sharing.decline')}
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {incomingActive.length > 0 ? (
              <section>
                <h3 className={styles.sectionTitle}>{t('sharing.incomingActive')}</h3>
                {incomingActive.map((share) => (
                  <div key={share.id} className={styles.card}>
                    <p className={styles.shareName}>{share.owner.username}</p>
                    <p className={styles.shareMeta}>{t('sharing.liveFrom')}</p>
                    <div className={styles.chips}>
                      {share.categories.map((cat) =>
                        cat === 'CART' ? (
                          <span key={cat} className={`${styles.chip} ${styles.chipOn}`}>
                            <IconShoppingBasket size={14} color={Colors.dashboard.stroke} />
                            {categoryLabel(cat)}
                          </span>
                        ) : (
                          <button
                            key={cat}
                            type="button"
                            className={`${styles.chip} ${liveId === share.id && liveCat === cat ? styles.chipOn : ''}`}
                            onClick={() => {
                              setLiveId(share.id);
                              setLiveCat(cat);
                            }}
                          >
                            {categoryLabel(cat)}
                          </button>
                        ),
                      )}
                    </div>
                    {share.categories.includes('CART') ? (
                      <p className={styles.hint}>{t('sharing.cartHint')}</p>
                    ) : null}
                    {share.categories.includes('MEAL_PLAN') ? (
                      <>
                        <p className={styles.hint}>{t('sharing.mealPlanHint')}</p>
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={() => navigate(`/meal-plan?ownerId=${share.owner.id}`)}
                        >
                          {t('sharing.openMealPlan')}
                        </button>
                      </>
                    ) : null}
                    {liveId === share.id && liveCat ? (
                      <ul className={styles.liveList}>
                        {liveItems.length === 0 ? (
                          <li className={styles.liveEmpty}>{t('sharing.liveEmpty')}</li>
                        ) : (
                          liveItems.map((item) => (
                            <li key={item.id}>
                              <strong>{item.title}</strong>
                              <span>{item.meta}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                    <button type="button" className={styles.ghost} onClick={() => setRevokeId(share.id)}>
                      {t('sharing.stop')}
                    </button>
                  </div>
                ))}
              </section>
            ) : null}

            {outgoing.length > 0 ? (
              <section>
                <h3 className={styles.sectionTitle}>{t('sharing.outgoing')}</h3>
                {outgoing.map((share) => (
                  <div key={share.id} className={styles.card}>
                    <p className={styles.shareName}>{share.partner.username}</p>
                    <p className={styles.shareMeta}>
                      {share.partner.email}
                      {share.status === 'PENDING' ? ` · ${t('sharing.waiting')}` : ''}
                    </p>
                    <p className={styles.shareCats}>{share.categories.map(categoryLabel).join(' · ')}</p>
                    <button type="button" className={styles.ghost} onClick={() => setRevokeId(share.id)}>
                      {t('sharing.revoke')}
                    </button>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>

      <ConfirmDialog
        visible={Boolean(revokeId)}
        title={t('sharing.revoke')}
        message={t('sharing.revokeMessage')}
        confirmLabel={t('sharing.revoke')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={async () => {
          if (revokeId) {
            await sharesApi.revoke(revokeId);
            if (liveId === revokeId) {
              setLiveId(null);
              setLiveCat(null);
            }
            setRevokeId(null);
            await load();
            void useCartStore.getState().refreshFromServer();
          }
        }}
        onClose={() => setRevokeId(null)}
      />
    </div>
  );
}
