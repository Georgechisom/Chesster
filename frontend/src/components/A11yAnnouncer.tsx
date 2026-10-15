/**
 * Issue 402: Screen Reader Announcements Component
 * 
 * Manages aria-live region for dynamic game updates.
 */

import React, { useEffect, useRef } from 'react';

interface A11yAnnouncerProps {
    message: string;
}

export function A11yAnnouncer({ message }: A11yAnnouncerProps) {
    const previousMessage = useRef('');

    useEffect(() => {
        // Only announce if message changed
        if (message && message !== previousMessage.current) {
            previousMessage.current = message;
        }
    }, [message]);

    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
        >
            {message}
        </div>
    );
}

// Add to global CSS:
// .sr-only {
//   position: absolute;
//   width: 1px;
//   height: 1px;
//   padding: 0;
//   margin: -1px;
//   overflow: hidden;
//   clip: rect(0, 0, 0, 0);
//   white-space: nowrap;
//   border-width: 0;
// }
