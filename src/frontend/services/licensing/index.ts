import { useEffect, useState } from 'react';

const KEY = 'fireup_license';

export function getLicense(): string | null {
  return localStorage.getItem(KEY);
}

export function setLicense(jwt: string): void {
  localStorage.setItem(KEY, jwt);
}

export function clearLicense(): void {
  localStorage.removeItem(KEY);
}

interface LicensePayload {
  sub: string;
  tier: 'pro' | 'pro_ai';
  status: 'active' | 'trialing';
  iat: number;
  exp: number;
  jti: string;
}

function decodeUnsafe(jwt: string): LicensePayload | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

export function decodeLicense(jwt: string): LicensePayload | null {
  return decodeUnsafe(jwt);
}

export function isExpiringSoon(jwt: string): boolean {
  const p = decodeUnsafe(jwt);
  if (!p?.exp) return true;
  return (p.exp * 1000 - Date.now()) < 12 * 3600 * 1000;
}

export async function refreshLicense(): Promise<string | null> {
  const token = getLicense();
  if (!token) return null;

  const res = await fetch('https://api-trader.dyagnosys.com/refresh-license', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    clearLicense();
    return null;
  }

  const { jwt } = await res.json();
  setLicense(jwt);
  return jwt;
}

export function useLicense() {
  const [license, setLicense] = useState<string | null>(getLicense());
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    const current = getLicense();
    setLicense(current);
    if (current) {
      const p = decodeUnsafe(current);
      setIsValid(p ? p.exp * 1000 > Date.now() : false);
    }
  }, []);

  return { license, isValid, setLicense, clearLicense };
}