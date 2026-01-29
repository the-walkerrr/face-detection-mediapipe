/**
 * flagManager.js - Proctoring flag state management
 * 
 * DESIGN DECISIONS:
 * - Pure functions for flag logic (testable, no side effects)
 * - Consecutive sample counting for FACE_MISSING (avoids flickering)
 * - Timestamp tracking for each flag change
 * - Auto-clear when conditions resolve
 * 
 * FLAG TYPES:
 * - FACE_OK: Single face detected, properly positioned
 * - FACE_MISSING: No face for N consecutive samples
 * - MULTIPLE_FACES: More than one face detected
 * - FACE_ROTATED: Head turned away from camera
 * - GAZE_AWAY: Eyes looking away from screen (with direction)
 * - LOW_LIGHT: Video too dark for reliable detection
 */

// Number of consecutive "no face" samples before flagging FACE_MISSING
// At 2 FPS, this means ~1.5 seconds of no face
export const FACE_MISSING_THRESHOLD = 3;

// Brightness threshold (0-255 scale)
// Below this value, flag LOW_LIGHT
export const LOW_LIGHT_THRESHOLD = 50;

/**
 * Create initial flag state
 * @returns {Object} Initial state
 */
export function createInitialState() {
    return {
        currentFlags: [],
        gazeDirection: null, // Store current gaze direction for display
        consecutiveMissing: 0,
        lastUpdate: null,
        history: [] // Timestamped flag history (limited)
    };
}

/**
 * Process analysis results and update flags
 * @param {Object} state - Current flag state
 * @param {Object} analysis - Analysis results from frame processor
 * @returns {Object} New state with updated flags
 */
export function processAnalysis(state, analysis) {
    const { faceCount, isRotated, isLookingAway, gazeDirection, brightness } = analysis;
    const now = Date.now();
    const newFlags = [];
    let consecutiveMissing = state.consecutiveMissing;
    let currentGazeDirection = null;

    // Check for multiple faces (immediate flag)
    if (faceCount > 1) {
        newFlags.push('MULTIPLE_FACES');
        consecutiveMissing = 0;
    }
    // Check for face presence
    else if (faceCount === 0) {
        consecutiveMissing++;
        if (consecutiveMissing >= FACE_MISSING_THRESHOLD) {
            newFlags.push('FACE_MISSING');
        }
    }
    // Single face detected
    else {
        consecutiveMissing = 0;

        // Check rotation first (head turned away)
        if (isRotated) {
            newFlags.push('FACE_ROTATED');
        }
        // Check gaze (eyes looking away while head is straight)
        else if (isLookingAway) {
            newFlags.push('GAZE_AWAY');
            currentGazeDirection = gazeDirection; // Store direction for display
        }
        // All good
        else {
            newFlags.push('FACE_OK');
        }
    }

    // Check lighting (independent of face detection)
    if (brightness < LOW_LIGHT_THRESHOLD) {
        newFlags.push('LOW_LIGHT');
    }

    // Update history only if flags changed
    const flagsChanged = !arraysEqual(state.currentFlags, newFlags) ||
        (isLookingAway && state.gazeDirection !== currentGazeDirection);
    let history = state.history;

    if (flagsChanged) {
        history = [
            ...state.history.slice(-19),
            {
                timestamp: now,
                flags: newFlags,
                details: {
                    faceCount,
                    isRotated,
                    isLookingAway,
                    gazeDirection: gazeDirection || null,
                    brightness: Math.round(brightness)
                }
            }
        ];
    }

    return {
        currentFlags: newFlags,
        gazeDirection: currentGazeDirection,
        consecutiveMissing,
        lastUpdate: now,
        history
    };
}

/**
 * Get human-readable message for a flag
 * @param {string} flag - Flag type
 * @param {string} gazeDirection - Optional gaze direction for GAZE_AWAY
 * @returns {string} Human-readable message
 */
export function getFlagMessage(flag, gazeDirection = null) {
    const messages = {
        'FACE_OK': 'Face detected',
        'FACE_MISSING': 'Warning: Face not detected',
        'MULTIPLE_FACES': 'Error: Multiple faces detected',
        'FACE_ROTATED': 'Warning: Face rotated away',
        'GAZE_AWAY': gazeDirection
            ? `Warning: Eyes looking ${formatGazeDirection(gazeDirection)}`
            : 'Warning: Eyes looking away',
        'LOW_LIGHT': 'Warning: Low lighting'
    };
    return messages[flag] || flag;
}

/**
 * Format gaze direction for display
 * @param {string} direction - Direction like "UP_LEFT", "DOWN", etc.
 * @returns {string} Formatted string like "up-left", "down"
 */
function formatGazeDirection(direction) {
    if (!direction || direction === 'CENTER') return 'away';
    return direction.toLowerCase().replace('_', '-');
}

/**
 * Get severity level for a flag (for styling)
 * @param {string} flag - Flag type
 * @returns {string} 'ok', 'warning', or 'error'
 */
export function getFlagSeverity(flag) {
    if (flag === 'FACE_OK') return 'ok';
    if (flag === 'MULTIPLE_FACES') return 'error';
    return 'warning';
}

/**
 * Helper: Check if two arrays have the same elements
 */
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
}
