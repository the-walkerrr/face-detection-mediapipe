/**
 * gazeEstimator.js - Eye gaze direction estimation (horizontal + vertical)
 * 
 * APPROACH:
 * MediaPipe FaceLandmarker provides 478 landmarks including iris positions.
 * We check where the iris is positioned within the eye opening:
 * 
 * HORIZONTAL: Iris position between inner/outer eye corners
 * VERTICAL: Iris position between upper/lower eyelids
 * 
 * COORDINATE SYSTEM:
 * - X increases to the RIGHT
 * - Y increases DOWNWARD
 * 
 * So for vertical:
 * - Upper eyelid has LOWER Y value
 * - Lower eyelid has HIGHER Y value
 * - Looking UP = iris moves UP = iris Y decreases
 * - Looking DOWN = iris moves DOWN = iris Y increases
 */

// Key landmark indices for FaceLandmarker (478 landmarks)
// Reference: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
const LANDMARKS = {
    // Iris centers
    RIGHT_IRIS: 468,
    LEFT_IRIS: 473,

    // Right eye corners (horizontal bounds)
    RIGHT_EYE_OUTER: 33,   // Towards ear (left side of image)
    RIGHT_EYE_INNER: 133,  // Towards nose (right side of image)

    // Right eye lids (vertical bounds) - use the middle points of the eyelids
    RIGHT_EYE_TOP: 27,     // Upper eyelid center
    RIGHT_EYE_BOTTOM: 23,  // Lower eyelid center (below the eye)

    // Left eye corners (horizontal bounds)
    LEFT_EYE_INNER: 362,   // Towards nose
    LEFT_EYE_OUTER: 263,   // Towards ear (right side of image)

    // Left eye lids (vertical bounds)
    LEFT_EYE_TOP: 257,     // Upper eyelid center
    LEFT_EYE_BOTTOM: 253   // Lower eyelid center
};

// Thresholds for gaze detection
const HORIZONTAL_THRESHOLD = 0.15; // Left/Right detection
const VERTICAL_THRESHOLD = 0.25;   // Up/Down detection (less sensitive due to smaller range)

// Minimum eye opening height (normalized) - if smaller, skip vertical detection
const MIN_EYE_HEIGHT_RATIO = 0.02;

/**
 * Calculate normalized offset of iris from center
 * Returns value from -1 to 1 where 0 = centered
 */
function getNormalizedOffset(irisPos, minPos, maxPos) {
    const center = (minPos + maxPos) / 2;
    const range = Math.abs(maxPos - minPos);

    if (range < 0.001) return 0;

    // Clamp the result to -1 to 1 to handle edge cases
    const offset = ((irisPos - center) / range) * 2;
    return Math.max(-1, Math.min(1, offset));
}

/**
 * Calculate horizontal iris offset (left/right)
 */
function getHorizontalOffset(iris, inner, outer) {
    if (!iris || !inner || !outer) return 0;
    return getNormalizedOffset(iris.x, Math.min(inner.x, outer.x), Math.max(inner.x, outer.x));
}

/**
 * Calculate vertical iris offset (up/down)
 * Negative = looking up (iris above center)
 * Positive = looking down (iris below center)
 */
function getVerticalOffset(iris, top, bottom, eyeWidth) {
    if (!iris || !top || !bottom) return { offset: 0, valid: false };

    // Eye height
    const eyeHeight = Math.abs(bottom.y - top.y);

    // Check if eye is too closed for reliable detection
    // Compare to eye width - healthy eye opening is roughly 1/3 of width
    if (eyeWidth > 0 && eyeHeight / eyeWidth < MIN_EYE_HEIGHT_RATIO) {
        return { offset: 0, valid: false };
    }

    const offset = getNormalizedOffset(iris.y, Math.min(top.y, bottom.y), Math.max(top.y, bottom.y));
    return { offset, valid: true };
}

/**
 * Analyze eye gaze from face landmarks
 * @param {Array} landmarks - Array of 478 face landmarks
 * @returns {Object} Gaze analysis result with both horizontal and vertical direction
 */
export function analyzeGaze(landmarks) {
    if (!landmarks || landmarks.length < 478) {
        return {
            horizontalGaze: 'UNKNOWN',
            verticalGaze: 'UNKNOWN',
            isLookingAway: false,
            gazeDirection: 'UNKNOWN',
            confidence: 0,
            details: null
        };
    }

    // Get iris landmarks
    const rightIris = landmarks[LANDMARKS.RIGHT_IRIS];
    const leftIris = landmarks[LANDMARKS.LEFT_IRIS];

    // Get right eye boundary landmarks
    const rightInner = landmarks[LANDMARKS.RIGHT_EYE_INNER];
    const rightOuter = landmarks[LANDMARKS.RIGHT_EYE_OUTER];
    const rightTop = landmarks[LANDMARKS.RIGHT_EYE_TOP];
    const rightBottom = landmarks[LANDMARKS.RIGHT_EYE_BOTTOM];

    // Get left eye boundary landmarks
    const leftInner = landmarks[LANDMARKS.LEFT_EYE_INNER];
    const leftOuter = landmarks[LANDMARKS.LEFT_EYE_OUTER];
    const leftTop = landmarks[LANDMARKS.LEFT_EYE_TOP];
    const leftBottom = landmarks[LANDMARKS.LEFT_EYE_BOTTOM];

    // Calculate eye widths for reference
    const rightEyeWidth = Math.abs((rightOuter?.x || 0) - (rightInner?.x || 0));
    const leftEyeWidth = Math.abs((leftOuter?.x || 0) - (leftInner?.x || 0));

    // Calculate horizontal offsets (left/right)
    const rightHorizontal = getHorizontalOffset(rightIris, rightInner, rightOuter);
    const leftHorizontal = getHorizontalOffset(leftIris, leftInner, leftOuter);
    const avgHorizontal = (rightHorizontal + leftHorizontal) / 2;

    // Calculate vertical offsets (up/down)
    const rightVertResult = getVerticalOffset(rightIris, rightTop, rightBottom, rightEyeWidth);
    const leftVertResult = getVerticalOffset(leftIris, leftTop, leftBottom, leftEyeWidth);

    // Only use vertical if both eyes have valid readings
    const verticalValid = rightVertResult.valid && leftVertResult.valid;
    const avgVertical = verticalValid
        ? (rightVertResult.offset + leftVertResult.offset) / 2
        : 0;

    // Determine horizontal gaze direction
    let horizontalGaze = 'CENTER';
    if (avgHorizontal < -HORIZONTAL_THRESHOLD) {
        horizontalGaze = 'LEFT';
    } else if (avgHorizontal > HORIZONTAL_THRESHOLD) {
        horizontalGaze = 'RIGHT';
    }

    // Determine vertical gaze direction
    // In image coords: negative offset = iris is higher = looking UP
    //                  positive offset = iris is lower = looking DOWN
    let verticalGaze = 'CENTER';
    if (verticalValid) {
        if (avgVertical < -VERTICAL_THRESHOLD) {
            verticalGaze = 'UP';
        } else if (avgVertical > VERTICAL_THRESHOLD) {
            verticalGaze = 'DOWN';
        }
    }

    // Combined gaze direction string
    let gazeDirection = 'CENTER';
    const directions = [];
    if (verticalGaze !== 'CENTER') directions.push(verticalGaze);
    if (horizontalGaze !== 'CENTER') directions.push(horizontalGaze);
    if (directions.length > 0) {
        gazeDirection = directions.join('_');
    }

    // Looking away if either direction is not center
    const isLookingAway = horizontalGaze !== 'CENTER' || verticalGaze !== 'CENTER';

    // Confidence based on how consistent both eyes are
    const hDiff = Math.abs(rightHorizontal - leftHorizontal);
    const vDiff = verticalValid ? Math.abs(rightVertResult.offset - leftVertResult.offset) : 0;
    const confidence = Math.max(0, 1 - (hDiff + vDiff));

    const details = {
        rightH: rightHorizontal.toFixed(3),
        leftH: leftHorizontal.toFixed(3),
        avgH: avgHorizontal.toFixed(3),
        rightV: rightVertResult.offset.toFixed(3),
        leftV: leftVertResult.offset.toFixed(3),
        avgV: avgVertical.toFixed(3),
        vValid: verticalValid
    };

    // Debug log
    console.log(`[gaze] H:${details.avgH} V:${details.avgV}${!verticalValid ? '(invalid)' : ''} => ${gazeDirection}${isLookingAway ? ' [AWAY]' : ''}`);

    return {
        horizontalGaze,
        verticalGaze,
        gazeDirection,
        isLookingAway,
        confidence,
        details
    };
}
