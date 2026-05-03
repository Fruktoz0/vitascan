import { useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import { ApiError } from '../../api/client';

type DirEntry = { name: string; path: string };

type Props = {
  open: boolean;
  title: string;
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
};

export function DirPickerModal({ open, title, initialPath, onSelect, onClose }: Props) {
  const [current, setCurrent] = useState(initialPath || '/');
  const [parent, setParent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState(initialPath || '/');

  useEffect(() => {
    if (open) {
      void navigateTo(initialPath || '/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath]);

  async function navigateTo(path: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getDatabaseDirs(path);
      setCurrent(res.current);
      setParent(res.parent);
      setDirs(res.dirs);
      setManualInput(res.current);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'A könyvtár nem olvasható.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="admin-modal-root" role="presentation">
      <button type="button" className="admin-modal-backdrop" aria-label="Bezárás" onClick={onClose} />
      <div className="admin-modal dir-picker-modal" role="dialog" aria-modal="true" aria-labelledby="dir-picker-title">
        <h2 id="dir-picker-title" className="admin-modal-title">{title}</h2>

        {/* Manual path entry */}
        <div className="dir-picker-path-row">
          <input
            className="admin-input dir-picker-path-input"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void navigateTo(manualInput); }}
            spellCheck={false}
            placeholder="/backups"
          />
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => void navigateTo(manualInput)}
            disabled={loading}
          >
            Ugrás
          </button>
        </div>

        {/* Breadcrumb current path */}
        <div className="dir-picker-current">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
            <path d="M1 3a1.5 1.5 0 011.5-1.5H5l1.5 1.5h5A1.5 1.5 0 0113 4.5v6A1.5 1.5 0 0111.5 12h-9A1.5 1.5 0 011 10.5V3z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
          </svg>
          <code className="dir-picker-current-path">{current}</code>
        </div>

        {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <div className="dir-picker-list">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
              <div className="admin-spinner" aria-hidden />
            </div>
          ) : (
            <>
              {parent !== null && (
                <button
                  type="button"
                  className="dir-picker-entry dir-picker-entry-up"
                  onClick={() => void navigateTo(parent!)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 12V5M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>.. (szülő könyvtár)</span>
                </button>
              )}

              {dirs.length === 0 && !loading && (
                <p className="dir-picker-empty">Nincs alkönyvtár ebben a mappában.</p>
              )}

              {dirs.map((d) => (
                <button
                  key={d.path}
                  type="button"
                  className="dir-picker-entry"
                  onClick={() => void navigateTo(d.path)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M1.5 3a1.5 1.5 0 011.5-1.5H6l1.5 1.5H13A1.5 1.5 0 0114.5 4.5v8A1.5 1.5 0 0113 14H3a1.5 1.5 0 01-1.5-1.5V3z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                  </svg>
                  <span>{d.name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="admin-modal-actions" style={{ borderTop: '1px solid var(--admin-border)', paddingTop: '0.85rem', marginTop: '0.5rem' }}>
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose}>
            Mégse
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => { onSelect(current); onClose(); }}
          >
            Kiválaszt: <code style={{ fontSize: '0.78em', marginLeft: 6 }}>{current}</code>
          </button>
        </div>
      </div>
    </div>
  );
}
