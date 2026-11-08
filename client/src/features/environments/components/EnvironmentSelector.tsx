import { useState } from 'react';
import { Button } from '../../../components/Button';
import type { Environments } from '../hooks/useEnvironments';
import { EnvironmentManager } from './EnvironmentManager';

/** Header control: which environment `{{variables}}` come from, and a way to edit them. */
export function EnvironmentSelector({ environments }: { environments: Environments }) {
  const [managing, setManaging] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Environment"
        value={environments.selected?.id ?? ''}
        onChange={(e) => environments.select(e.target.value === '' ? null : e.target.value)}
        className="max-w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
      >
        <option value="">No environment</option>
        {environments.environments.map((environment) => (
          <option key={environment.id} value={environment.id}>
            {environment.name}
          </option>
        ))}
      </select>
      <Button onClick={() => setManaging(true)}>Manage</Button>
      {managing && (
        <EnvironmentManager environments={environments} onClose={() => setManaging(false)} />
      )}
    </div>
  );
}
