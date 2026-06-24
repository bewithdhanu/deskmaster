import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isExternalAppUrl, openExternalUrl } from '../../utils/openExternalUrl';

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
  code: ({ inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code className="rounded bg-theme-secondary px-1 py-0.5 text-xs" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={`block overflow-x-auto text-xs ${className || ''}`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-2 overflow-x-auto rounded-md bg-theme-secondary p-3 text-xs last:mb-0">{children}</pre>,
  a: ({ href, children }) => (
    <a
      href={isExternalAppUrl(href) ? '#' : href}
      className="text-red-500 underline hover:text-red-400"
      rel="noopener noreferrer"
      onClick={(event) => {
        if (!isExternalAppUrl(href)) return;
        event.preventDefault();
        openExternalUrl(href).catch((error) => {
          console.warn('Failed to open link:', error);
        });
      }}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-theme pl-3 text-theme-muted last:mb-0">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-theme px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-theme px-2 py-1">{children}</td>,
  hr: () => <hr className="my-3 border-theme" />
};

export default function AgentMarkdown({ content, className = '' }) {
  const text = String(content || '').trim();
  if (!text) return null;

  return (
    <div className={`agent-markdown text-sm leading-relaxed ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
