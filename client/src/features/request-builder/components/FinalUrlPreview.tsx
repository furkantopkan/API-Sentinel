import type { BuildFinalUrlResult } from '@api-sentinel/shared';

interface FinalUrlPreviewProps {
  result: BuildFinalUrlResult;
  isUrlEmpty: boolean;
}

/** Shows the exact URL that will be requested (typed URL + enabled params). */
export function FinalUrlPreview({ result, isUrlEmpty }: FinalUrlPreviewProps) {
  if (isUrlEmpty) {
    return <p className="text-xs text-slate-400">Final URL preview appears here.</p>;
  }

  if (!result.ok) {
    return <p className="text-xs text-amber-700">{result.error}</p>;
  }

  return (
    <p className="truncate font-mono text-xs text-slate-500" title={result.url}>
      <span className="font-sans text-slate-400">Final URL: </span>
      {result.url}
    </p>
  );
}
