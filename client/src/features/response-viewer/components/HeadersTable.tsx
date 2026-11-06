export function HeadersTable({ headers }: { headers: readonly [string, string][] }) {
  if (headers.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">No response headers.</p>;
  }
  return (
    <table className="w-full text-left font-mono text-xs">
      <tbody>
        {headers.map(([name, value], index) => (
          // A header may repeat (set-cookie), so the index is part of the key.
          <tr key={`${name}-${index}`} className="border-b border-slate-100 align-top">
            <th scope="row" className="w-1/3 py-1.5 pr-4 font-medium text-slate-600">
              {name}
            </th>
            <td className="py-1.5 break-all text-slate-800">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
