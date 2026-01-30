/**
 * frameProcessor.js - Throttled frame analysis orchestrator
 * 
 * DESIGN DECISIONS:
 * - setInterval-based sampling (NOT requestAnimationFrame)
 * - Processing time measurement for each cycle
 * - Auto-disable if processing consistently exceeds budget
 * - OffscreenCanvas for frame capture when available
 * 
 * PERFORMANCE CONSTRAINTS:
 * - Maximum 2 FPS (500ms interval)
 * - Skip frame if previous analysis still running
 * - Auto-disable after 3 consecutive overruns
 */

import { detectFaces, cleanup as cleanupDetector } from './faceAnalyzer';

// Processing configuration
const PROCESS_INTERVAL_MS = 500; // 2 FPS max
const MAX_PROCESSING_MS = 200; // Time budget per frame
const MAX_CONSECUTIVE_OVERRUNS = 3;

/**
 * Create a frame processor instance
 * @param {Object} options - Configuration options
 * @param {HTMLVideoElement} options.videoElement - Video element to capture from
 * @param {Function} options.onAnalysis - Callback with analysis results
 * @param {Function} options.onDisabled - Callback when auto-disabled
 * @param {Function} options.onError - Callback for errors
 * @returns {Object} Processor controls
 */
export function createFrameProcessor(options) {
    const { videoElement, onAnalysis, onDisabled, onError } = options;

    // State
    let intervalId = null;
    let isProcessing = false;
    let consecutiveOverruns = 0;
    let isDisabled = false;
    let canvas = null;
    let ctx = null;

    /**
     * Initialize canvas for frame capture
     * Uses OffscreenCanvas if available for better performance
     */
    function initCanvas() {
        const width = videoElement.videoWidth || 320;
        const height = videoElement.videoHeight || 240;

        // Try OffscreenCanvas first (better performance, doesn't touch DOM)
        if (typeof OffscreenCanvas !== 'undefined') {
            canvas = new OffscreenCanvas(width, height);
        } else {
            // Fallback to regular canvas (hidden)
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
        }
        ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    /**
     * Capture current video frame to canvas
     * @returns {HTMLCanvasElement|OffscreenCanvas}
     */
    function captureFrame() {
        if (!canvas || !ctx) {
            initCanvas();
        }
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    /**
     * Calculate average brightness of the frame
     * Cheap operation: samples a subset of pixels
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @returns {number} Average brightness (0-255)
     */
    function calculateBrightness(ctx) {
        const width = canvas.width;
        const height = canvas.height;

        // Sample every 10th pixel for speed
        const sampleStep = 10;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        let totalBrightness = 0;
        let sampleCount = 0;

        for (let i = 0; i < data.length; i += 4 * sampleStep) {
            // Luminance formula (perceived brightness)
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
            sampleCount++;
        }

        return sampleCount > 0 ? totalBrightness / sampleCount : 0;
    }

    /**
     * Process a single frame
     * Measures timing and handles auto-disable
     */
    async function processFrame() {
        // Skip if already processing or disabled
        if (isProcessing || isDisabled) {
            return;
        }

        // Skip if video not ready
        if (!videoElement || videoElement.readyState < 2) {
            return;
        }

        isProcessing = true;
        const startTime = performance.now();

        try {
            // Capture frame
            const frame = captureFrame();

            // Run face detection
            const faceDetection = await detectFaces(frame);

            // Calculate brightness
            const brightness = calculateBrightness(ctx);



            // Calculate processing time
            const processingTime = performance.now() - startTime;

            // Check for overrun
            if (processingTime > MAX_PROCESSING_MS) {
                consecutiveOverruns++;
                console.warn(`[frameProcessor] Overrun: ${processingTime.toFixed(1)}ms (${consecutiveOverruns}/${MAX_CONSECUTIVE_OVERRUNS})`);

                if (consecutiveOverruns >= MAX_CONSECUTIVE_OVERRUNS) {
                    disable('Processing time exceeded budget');
                    return;
                }
            } else {
                consecutiveOverruns = 0;
            }

            // Report results
            if (onAnalysis) {
                onAnalysis({
                    faceCount: faceDetection.count,
                    brightness,
                    processingTime
                });
            }
        } catch (error) {
            console.error('[frameProcessor] Analysis error:', error);
            if (onError) {
                onError(error);
            }
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Disable the processor (auto-disable or manual)
     * @param {string} reason - Why processing was disabled
     */
    function disable(reason) {
        isDisabled = true;
        stop();
        console.warn(`[frameProcessor] Disabled: ${reason}`);
        if (onDisabled) {
            onDisabled(reason);
        }
    }

    /**
     * Start processing frames
     */
    function start() {
        if (intervalId) {
            return; // Already running
        }

        isDisabled = false;
        consecutiveOverruns = 0;

        // Use setInterval for throttled processing (NOT requestAnimationFrame)
        intervalId = setInterval(processFrame, PROCESS_INTERVAL_MS);
        console.log(`[frameProcessor] Started (${PROCESS_INTERVAL_MS}ms interval)`);
    }

    /**
     * Stop processing frames
     */
    function stop() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('[frameProcessor] Stopped');
        }
    }

    /**
     * Cleanup all resources
     */
    async function cleanup() {
        stop();
        canvas = null;
        ctx = null;
        await cleanupDetector();
    }

    /**
     * Get current processor status
     */
    function getStatus() {
        return {
            isRunning: intervalId !== null,
            isProcessing,
            isDisabled,
            consecutiveOverruns
        };
    }

    return {
        start,
        stop,
        cleanup,
        getStatus
    };
}
