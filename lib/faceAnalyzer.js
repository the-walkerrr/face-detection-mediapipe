/**
 * faceAnalyzer.js - MediaPipe Face Detector wrapper
 * 
 * DESIGN DECISIONS:
 * - Uses lightweight FaceDetector for face counting only
 * - Singleton pattern: Only one detector instance to save memory
 * - Lazy initialization: Model loads only when first needed
 * 
 * PERFORMANCE CONSIDERATIONS:
 * - Uses 'short_range' model for speed (optimized for faces within 2m)
 * - Single detection mode (not continuous) for throttled processing
 * - WebGL delegate for GPU acceleration when available
 */

import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

// Singleton instance
let detectorInstance = null;
let initPromise = null;

// MediaPipe CDN for WASM files
const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Initialize the FaceDetector singleton
 * @returns {Promise<FaceDetector>}
 */
async function initializeDetector() {
    if (detectorInstance) {
        return detectorInstance;
    }

    // Prevent multiple simultaneous initializations
    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            console.log('[faceAnalyzer] Loading MediaPipe vision WASM...');
            const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

            console.log('[faceAnalyzer] Creating FaceDetector...');
            detectorInstance = await FaceDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
                    delegate: 'GPU' // Use WebGL when available
                },
                runningMode: 'IMAGE', // Single image mode (not video stream)
                minDetectionConfidence: 0.5
            });

            console.log('[faceAnalyzer] FaceDetector ready');
            return detectorInstance;
        } catch (error) {
            console.error('[faceAnalyzer] Failed to initialize:', error);
            initPromise = null;
            throw error;
        }
    })();

    return initPromise;
}

/**
 * Detect faces in an image/canvas/video frame
 * @param {HTMLCanvasElement|HTMLVideoElement|ImageData} image - Input image
 * @returns {Promise<Object>} Detection results with face count
 */
export async function detectFaces(image) {
    const detector = await initializeDetector();

    // FaceDetector.detect() returns detections with bounding boxes
    const result = detector.detect(image);

    return {
        count: result.detections?.length || 0
    };
}

/**
 * Check if detector is initialized
 * @returns {boolean}
 */
export function isInitialized() {
    return detectorInstance !== null;
}

/**
 * Cleanup detector resources
 * Call this when analysis is stopped to free GPU memory
 */
export async function cleanup() {
    if (detectorInstance) {
        detectorInstance.close();
        detectorInstance = null;
        initPromise = null;
        console.log('[faceAnalyzer] Detector cleaned up');
    }
}
