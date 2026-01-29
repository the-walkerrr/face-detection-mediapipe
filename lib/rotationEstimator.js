/**
 * rotationEstimator.js - Simple head rotation estimation
 * 
 * DESIGN DECISIONS:
 * - Uses MediaPipe FaceLandmarker's 478 landmarks
 * - Returns directional signal only (LEFT/RIGHT/CENTER), not precise angles
 * - Uses nose tip and ear landmarks for yaw estimation
 * - Uses eye landmarks for roll estimation
 * 
 * KEY LANDMARKS FOR ROTATION:
 * - Nose tip: 1
 * - Right ear: 234
 * - Left ear: 454
 * - Right eye outer: 33
 * - Left eye outer: 263
 * 
 * ACCURACY NOTE:
 * This is a rough directional signal, NOT precise angle measurement.
 * Sufficient for flagging obvious head turns during proctoring.
 */

// Key landmark indices for FaceLandmarker (478 landmarks)
const LANDMARKS = {
    NOSE_TIP: 1,
    RIGHT_EAR: 234,
    LEFT_EAR: 454,
    RIGHT_EYE_OUTER: 33,
    LEFT_EYE_OUTER: 263,
    CHIN: 152
};

// Thresholds for rotation detection
const YAW_THRESHOLD = 0.6; // Ratio below this = looking left
const ROLL_THRESHOLD = 0.15; // Eye height difference as fraction

/**
 * Calculate Euclidean distance between two landmarks
 * @param {Object} p1 - Point with x, y properties
 * @param {Object} p2 - Point with x, y properties
 * @returns {number} Distance
 */
function distance(p1, p2) {
    if (!p1 || !p2) return 0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Estimate head yaw (left/right rotation) from landmarks
 * 
 * HEURISTIC:
 * When looking right, the left ear becomes more visible (larger distance from nose)
 * When looking left, the right ear becomes more visible
 * 
 * @param {Array} landmarks - FaceLandmarker 478 landmarks
 * @returns {string} 'LEFT', 'RIGHT', or 'CENTER'
 */
function estimateYaw(landmarks) {
    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const leftEar = landmarks[LANDMARKS.LEFT_EAR];
    const rightEar = landmarks[LANDMARKS.RIGHT_EAR];

    if (!nose || !leftEar || !rightEar) {
        return 'CENTER';
    }

    const leftEarDist = distance(nose, leftEar);
    const rightEarDist = distance(nose, rightEar);

    if (leftEarDist === 0 || rightEarDist === 0) {
        return 'CENTER';
    }

    // Ratio of ear distances
    const ratio = rightEarDist / leftEarDist;

    if (ratio < YAW_THRESHOLD) {
        return 'LEFT';
    }
    if (ratio > 1 / YAW_THRESHOLD) {
        return 'RIGHT';
    }
    return 'CENTER';
}

/**
 * Estimate head roll (tilt) from eye positions
 * 
 * HEURISTIC:
 * When head is tilted, one eye will be higher than the other
 * 
 * @param {Array} landmarks - FaceLandmarker 478 landmarks
 * @returns {string} 'TILTED_LEFT', 'TILTED_RIGHT', or 'LEVEL'
 */
function estimateRoll(landmarks) {
    const leftEye = landmarks[LANDMARKS.LEFT_EYE_OUTER];
    const rightEye = landmarks[LANDMARKS.RIGHT_EYE_OUTER];

    if (!leftEye || !rightEye) {
        return 'LEVEL';
    }

    const eyeDistance = distance(leftEye, rightEye);
    if (eyeDistance === 0) {
        return 'LEVEL';
    }

    // Vertical difference as fraction of eye distance
    const heightDiff = (leftEye.y - rightEye.y) / eyeDistance;

    if (heightDiff > ROLL_THRESHOLD) {
        return 'TILTED_RIGHT';
    }
    if (heightDiff < -ROLL_THRESHOLD) {
        return 'TILTED_LEFT';
    }
    return 'LEVEL';
}

/**
 * Analyze head rotation from FaceLandmarker result
 * @param {Array} landmarks - 478 face landmarks from FaceLandmarker
 * @returns {Object} Rotation estimates
 */
export function analyzeRotation(landmarks) {
    if (!landmarks || landmarks.length < 478) {
        return {
            yaw: 'UNKNOWN',
            roll: 'UNKNOWN',
            isRotated: false
        };
    }

    const yaw = estimateYaw(landmarks);
    const roll = estimateRoll(landmarks);

    // Face is considered "rotated" if yaw is not center
    const isRotated = yaw !== 'CENTER';

    return {
        yaw,
        roll,
        isRotated
    };
}
