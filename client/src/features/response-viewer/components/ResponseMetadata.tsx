import type { ExecutedResponse } from '@api-sentinel/shared';
import { responseMetadata } from '../lib/responseMetadata';

/** "Info" tab: key facts about the response in one table. */
export function ResponseMetadata({ response }: { response: ExecutedResponse }) {
  const rows = responseMetadata(response);
  return (
    <table className="w-full text-left text-xs" aria-label="Response metadata">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-slate-100 align-top">
            <th scope="row" className="w-40 py-1.5 pr-3 font-medium text-slate-500">
              {row.label}
            </th>
            <td className="py-1.5 font-mono break-all whitespace-pre-wrap text-slate-800">
              {row.value}
              {row.hint && <p className="font-sans text-slate-400">{row.hint}</p>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
