/**
 * Issue 402: Complete Keyboard Navigation and Screen Reader Support
 * 
 * Implement WAI-ARIA grid pattern with keyboard navigation.
 */

import React, { useState, useRef, useEffect } from 'react';
import { A11yAnnouncer } from './A11yAnnouncer';

export function ChessBoard() {
    const [focusedSquare, setFocusedSquare] = useState<[number, number]>([0, 0]);
    const [selectedSquare, setSelectedSquare] = useState<[number, number] | null>(null);
    const [announcement, setAnnouncement] = useState('');

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                setFocusedSquare([Math.max(0, row - 1), col]);
                break;
            case 'ArrowDown':
                e.preventDefault();
                setFocusedSquare([Math.min(7, row + 1), col]);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                setFocusedSquare([row, Math.max(0, col - 1)]);
                break;
            case 'ArrowRight':
                e.preventDefault();
                setFocusedSquare([row, Math.min(7, col + 1)]);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                handleSquareClick(row, col);
                break;
        }
    };

    // Handle square click/selection
    const handleSquareClick = (row: number, col: number) => {
        if (selectedSquare) {
            // Execute move
            const from = selectedSquare;
            const to = [row, col];
            executeMove(from, to);
            setSelectedSquare(null);
        } else {
            // Select piece
            if (hasPiece(row, col)) {
                setSelectedSquare([row, col]);
                announceSelection(row, col);
            }
        }
    };

    // Announce move to screen readers
    const announceSelection = (row: number, col: number) => {
        const square = getSquareName(row, col);
        const piece = getPiece(row, col);
        setAnnouncement(`Selected ${piece} at ${square}`);
    };

    const announceMove = (from: [number, number], to: [number, number]) => {
        const fromSquare = getSquareName(from[0], from[1]);
        const toSquare = getSquareName(to[0], to[1]);
        const piece = getPiece(from[0], from[1]);
        setAnnouncement(`${piece} moved from ${fromSquare} to ${toSquare}`);
    };

    // Get square label for aria-label
    const getSquareLabel = (row: number, col: number) => {
        const square = getSquareName(row, col);
        const piece = getPiece(row, col);
        return piece ? `${square} ${piece}` : `${square} empty square`;
    };

    const getSquareName = (row: number, col: number) => {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
        return `${files[col]}${ranks[row]}`;
    };

    return (
        <div className="chessboard-container">
            <A11yAnnouncer message={announcement} />
            
            {/* Chessboard Grid */}
            <div 
                role="grid" 
                aria-label="Chess board"
                className="chessboard"
            >
                {Array.from({ length: 8 }).map((_, row) => (
                    <div key={row} role="row" className="board-row">
                        {Array.from({ length: 8 }).map((_, col) => {
                            const isFocused = focusedSquare[0] === row && focusedSquare[1] === col;
                            const isSelected = selectedSquare?.[0] === row && selectedSquare?.[1] === col;
                            
                            return (
                                <div
                                    key={`${row}-${col}`}
                                    role="gridcell"
                                    aria-label={getSquareLabel(row, col)}
                                    tabIndex={isFocused ? 0 : -1}
                                    className={`square ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                                    onClick={() => handleSquareClick(row, col)}
                                    onKeyDown={(e) => handleKeyDown(e, row, col)}
                                    onFocus={() => setFocusedSquare([row, col])}
                                >
                                    {renderPiece(row, col)}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Accessible move input */}
            <div className="move-input-container">
                <label htmlFor="move-input">Enter move (e.g., Nf3 or e2e4):</label>
                <input
                    id="move-input"
                    type="text"
                    placeholder="Type move notation"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const move = (e.target as HTMLInputElement).value;
                            handleTextMove(move);
                            (e.target as HTMLInputElement).value = '';
                        }
                    }}
                />
            </div>
        </div>
    );
}

// Helper functions (stubs)
function getPiece(row: number, col: number): string {
    // Return piece name or empty string
    return '';
}

function hasPiece(row: number, col: number): boolean {
    return !!getPiece(row, col);
}

function executeMove(from: [number, number], to: [number, number]) {
    // Execute move logic
}

function handleTextMove(move: string) {
    // Parse and execute SAN/UCI move
}

function renderPiece(row: number, col: number) {
    // Render piece component
    return null;
}

// CSS for focus outlines (add to styles):
// .square.focused {
//   outline: 3px solid #4A90E2;
//   outline-offset: -3px;
//   z-index: 10;
// }
