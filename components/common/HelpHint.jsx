import React from 'react';

export default function HelpHint({ label, children }) {
  return (
    <details className="aopd-help-hint">
      <summary aria-label={`Help: ${label}`} title={`Help: ${label}`}>?</summary>
      <div className="aopd-help-hint-popover">
        <strong>{label}</strong>
        <p>{children}</p>
      </div>
    </details>
  );
}
