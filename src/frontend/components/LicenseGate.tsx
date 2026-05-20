import { useEffect, useState } from 'react';
import { getLicense, setLicense, clearLicense } from '@/services/licensing';

function decodePayload(jwt: string): { exp?: number; tier?: string } | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function isLicenseValid(jwt: string | null): boolean {
  if (!jwt) return false;
  const p = decodePayload(jwt);
  if (!p?.exp) return false;
  return p.exp * 1000 > Date.now();
}

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const [license, setLicenseState] = useState<string | null>(getLicense());
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Capture #license=... from URL hash on first load
  useEffect(() => {
    if (window.location.hash.startsWith('#license=')) {
      const fromHash = decodeURIComponent(window.location.hash.slice('#license='.length));
      if (isLicenseValid(fromHash)) {
        setLicense(fromHash);
        setLicenseState(fromHash);
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  // Background refresh check every 5 min — if invalid, clear and re-gate
  useEffect(() => {
    if (!license) return;
    const t = setInterval(() => {
      if (!isLicenseValid(getLicense())) {
        clearLicense();
        setLicenseState(null);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [license]);

  if (isLicenseValid(license)) return <>{children}</>;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h1 style={{ color: '#fafafa', fontSize: '2rem', marginBottom: '0.5rem' }}>License required</h1>
        <p style={{ color: '#a1a1aa', marginBottom: '2rem' }}>
          Paste your Fireup Trader license token to continue. Don't have one?{' '}
          <a href="https://trader.dyagnosys.com" style={{ color: '#22c55e' }}>Start a 14-day free trial</a>.
        </p>
        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          placeholder="eyJhbGciOiJIUzI1NiJ9…"
          rows={5}
          style={{
            width: '100%', padding: '1rem', borderRadius: 8,
            background: '#111', color: '#fafafa', border: '1px solid #3a3a3a',
            fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '0.5rem',
          }}
        />
        {error && <p style={{ color: '#fca5a5', marginBottom: '1rem' }}>{error}</p>}
        <button
          onClick={() => {
            const v = input.trim();
            if (!isLicenseValid(v)) {
              setError('Invalid or expired license. Check the token and try again.');
              return;
            }
            setLicense(v);
            setLicenseState(v);
            setInput('');
          }}
          style={{
            background: '#22c55e', color: '#0a0a0a', padding: '0.75rem 1.5rem',
            border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Unlock app
        </button>
        <p style={{ color: '#666', fontSize: '0.875rem', marginTop: '2rem' }}>
          Lost your license? <a href="https://trader.dyagnosys.com/recover" style={{ color: '#22c55e' }}>Recover it</a>.
        </p>
      </div>
    </div>
  );
}