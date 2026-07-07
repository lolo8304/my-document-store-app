import { Fragment } from 'react';

export function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const safeTerms = terms.filter(Boolean).sort((a, b) => b.length - a.length);
  if (safeTerms.length === 0) {
    return <>{text}</>;
  }

  const pattern = new RegExp(`(${safeTerms.map(escapeRegExp).join('|')})`, 'gi');
  return (
    <>
      {text.split(pattern).map((part, index) => {
        const matched = safeTerms.some((term) => term.toLowerCase() === part.toLowerCase());
        return matched ? (
          <mark key={`${part}-${index}`} className="bg-amber-200 text-stone-950">
            {part}
          </mark>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        );
      })}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
