/**
 * Issue 401: Real-Time Latency Ping Indicator
 * 
 * Add latency badge and reconnection banner with backoff countdown.
 */

import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { measureLatency } from '../api/socket';

export function NetworkBanner() {
    const { pingMs, socketStatus, reconnectAttempts } = useGameStore();
    const [countdown, setCountdown] = useState(0);

    // Latency color coding
    const getLatencyColor = (ms: number) => {
        if (ms < 80) return 'text-green-500';
        if (ms < 200) return 'text-yellow-500';
        return 'text-red-500';
    };

    const getLatencyDot = (ms: number) => {
        if (ms < 80) return 'bg-green-500';
        if (ms < 200) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    // Handle manual reconnect
    const handleReconnect = () => {
        const socket = useGameStore.getState().socket;
        if (socket) {
            socket.connect();
        }
    };

    // Countdown timer for reconnection backoff
    useEffect(() => {
        if (socketStatus === 'reconnecting') {
            const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            setCountdown(Math.floor(backoffMs / 1000));

            const interval = setInterval(() => {
                setCountdown(prev => Math.max(0, prev - 1));
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [socketStatus, reconnectAttempts]);

    return (
        <div className="fixed top-0 right-0 z-50">
            {/* Latency Badge */}
            {socketStatus === 'connected' && (
                <div className="m-4 px-3 py-2 bg-gray-900 rounded-lg shadow-lg flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getLatencyDot(pingMs)}`} />
                    <span className={`text-sm font-mono ${getLatencyColor(pingMs)}`}>
                        {pingMs}ms
                    </span>
                </div>
            )}

            {/* Reconnecting Banner */}
            {(socketStatus === 'reconnecting' || socketStatus === 'disconnected') && (
                <div className="m-4 px-4 py-3 bg-yellow-900 border border-yellow-600 rounded-lg shadow-lg">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                            <span className="text-sm text-yellow-100 font-medium">
                                {socketStatus === 'reconnecting' 
                                    ? `Reconnecting to match server (attempt ${reconnectAttempts})...`
                                    : 'Connection lost'}
                            </span>
                        </div>
                        <button
                            onClick={handleReconnect}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-medium transition-colors"
                        >
                            Reconnect Now
                        </button>
                    </div>
                    {countdown > 0 && (
                        <div className="mt-2 text-xs text-yellow-300">
                            Next attempt in {countdown}s
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ADD to socket.ts:
export function measureLatency(socket: Socket, onLatency: (ms: number) => void) {
    const start = Date.now();
    socket.emit("ping:check", () => {
        const latency = Date.now() - start;
        onLatency(latency);
    });
}

// Start periodic latency measurement (every 10s)
setInterval(() => {
    if (socket.connected) {
        measureLatency(socket, (ms) => {
            useGameStore.getState().setPingMs(ms);
        });
    }
}, 10000);
