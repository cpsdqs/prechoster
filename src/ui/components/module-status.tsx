import React from 'react';
import './module-status.css';

/** Displays a status line. */
export function ModuleStatus({ children }: { children: React.ReactNode }) {
    return <div className="module-status">{children}</div>;
}
