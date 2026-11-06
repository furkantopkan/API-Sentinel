import type { AuthConfig, AuthType } from '../types';

const AUTH_OPTIONS: { type: AuthType; label: string }[] = [
  { type: 'none', label: 'No Auth' },
  { type: 'bearer', label: 'Bearer Token' },
  { type: 'basic', label: 'Basic Auth' },
];

/**
 * Switching the type starts from empty fields on purpose: a token typed for
 * "Bearer" is not silently kept around (and later sent) after switching away.
 */
function emptyAuth(type: AuthType): AuthConfig {
  switch (type) {
    case 'none':
      return { type: 'none' };
    case 'bearer':
      return { type: 'bearer', token: '' };
    case 'basic':
      return { type: 'basic', username: '', password: '' };
  }
}

interface AuthPanelProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

const inputClass = 'w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm';
const labelClass = 'block text-xs font-medium text-slate-600';

export function AuthPanel({ auth, onChange }: AuthPanelProps) {
  return (
    <div className="max-w-xl space-y-3">
      <label className={labelClass}>
        Type
        <select
          value={auth.type}
          onChange={(event) => {
            const option = AUTH_OPTIONS.find((o) => o.type === event.target.value);
            if (option) onChange(emptyAuth(option.type));
          }}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {AUTH_OPTIONS.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {auth.type === 'none' && (
        <p className="text-sm text-slate-400">This request does not use authorization.</p>
      )}

      {/* Inside these branches TypeScript knows exactly which fields exist. */}
      {auth.type === 'bearer' && (
        <label className={labelClass}>
          Token
          <input
            type="password"
            autoComplete="off"
            value={auth.token}
            onChange={(event) => onChange({ ...auth, token: event.target.value })}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      )}

      {auth.type === 'basic' && (
        <>
          <label className={labelClass}>
            Username
            <input
              type="text"
              autoComplete="off"
              value={auth.username}
              onChange={(event) => onChange({ ...auth, username: event.target.value })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className={labelClass}>
            Password
            <input
              type="password"
              autoComplete="off"
              value={auth.password}
              onChange={(event) => onChange({ ...auth, password: event.target.value })}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </>
      )}

      {auth.type !== 'none' && (
        <p className="text-xs text-slate-400">
          The Authorization header is generated automatically when the request is sent.
        </p>
      )}
    </div>
  );
}
