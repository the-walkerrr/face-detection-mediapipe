/**
 * faceAnalyzer.js - MediaPipe Face Landmarker wrapper
 * 
 * DESIGN DECISIONS:
 * - Uses FaceLandmarker instead of FaceDetector for richer landmarks
 * - Provides 478 landmarks including iris positions for gaze tracking
 * - Singleton pattern: Only one detector instance to save memory
 * - Lazy initialization: Model loads only when first needed
 * 
 * PERFORMANCE CONSIDERATIONS:
 * - Uses 'short_range' model for speed
 * - Single detection mode (not continuous) for throttled processing
 * - WebGL delegate for GPU acceleration when available
 * 
 * WHY FACELANDMARKER OVER FACEDETECTOR:
 * - FaceDetector only has 6 keypoints (not enough for gaze)
 * - FaceLandmarker provides 478 landmarks including:
 *   - Detailed eye contours
 *   - Iris center positions (landmarks 468-477)
 *   - Blend shapes for eye openness
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Singleton instance
let landmarkerInstance = null;
let initPromise = null;

// MediaPipe CDN for WASM files
const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Initialize the FaceLandmarker singleton
 * @returns {Promise<FaceLandmarker>}
 */
async function initializeLandmarker() {
    if (landmarkerInstance) {
        return landmarkerInstance;
    }

    // Prevent multiple simultaneous initializations
    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            console.log('[faceAnalyzer] Loading MediaPipe vision WASM...');
            const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

            console.log('[faceAnalyzer] Creating FaceLandmarker...');
            landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU' // Use WebGL when available
                },
                runningMode: 'IMAGE', // Single image mode (not video stream)
                numFaces: 2, // Detect up to 2 faces for multiple face detection
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
                outputFaceBlendshapes: true, // For eye tracking data
                outputFacialTransformationMatrixes: false // Don't need 3D transform
            });

            console.log('[faceAnalyzer] FaceLandmarker ready');
            return landmarkerInstance;
        } catch (error) {
            console.error('[faceAnalyzer] Failed to initialize:', error);
            initPromise = null;
            throw error;
        }
    })();

    return initPromise;
}

/**
 * Detect faces and landmarks in an image/canvas/video frame
 * @param {HTMLCanvasElement|HTMLVideoElement|ImageData} image - Input image
 * @returns {Promise<Object>} Detection results with faces, landmarks, and blendshapes
 */
export async function detectFaces(image) {
    const landmarker = await initializeLandmarker();

    // FaceLandmarker.detect() returns structured results
    const result = landmarker.detect(image);

    return {
        faces: result.faceLandmarks || [],
        blendshapes: result.faceBlendshapes || [],
        count: result.faceLandmarks?.length || 0
    };
}

/**
 * Check if landmarker is initialized
 * @returns {boolean}
 */
export function isInitialized() {
    return landmarkerInstance !== null;
}

/**
 * Cleanup landmarker resources
 * Call this when analysis is stopped to free GPU memory
 */
export async function cleanup() {
    if (landmarkerInstance) {
        landmarkerInstance.close();
        landmarkerInstance = null;
        initPromise = null;
        console.log('[faceAnalyzer] Landmarker cleaned up');
    }
}
