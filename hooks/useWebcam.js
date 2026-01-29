/**
 * useWebcam.js - Custom hook for webcam management
 * 
 * PERFORMANCE CONSIDERATIONS:
 * - Camera stream is requested ONLY on explicit user action (not auto-start)
 * - Uses low resolution (320x240) to minimize processing overhead
 * - Video ref is stable to prevent unnecessary re-renders
 * - Cleanup on unmount prevents memory leaks
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// Low resolution constraints for performance
// 320x240 is sufficient for face detection and minimizes CPU/GPU load
const VIDEO_CONSTRAINTS = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  facingMode: 'user',
  frameRate: { ideal: 15, max: 15 } // Cap framerate to reduce processing
};

/**
 * Custom hook for managing webcam access
 * @returns {Object} Webcam state and controls
 */
export function useWebcam() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Stable ref for video element - doesn't trigger re-renders
  const videoRef = useRef(null);
  // Stream ref for cleanup
  const streamRef = useRef(null);

  /**
   * Start webcam capture
   * Called on user action to comply with browser autoplay policies
   */
  const startCamera = useCallback(async () => {
    if (isActive || isLoading) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: false
      });

      streamRef.current = stream;

      // Attach stream to video element if available
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = resolve;
        });
        await videoRef.current.play();
      }

      setIsActive(true);
    } catch (err) {
      console.error('[useWebcam] Failed to access camera:', err);
      setError(err.message || 'Failed to access camera');
    } finally {
      setIsLoading(false);
    }
  }, [isActive, isLoading]);

  /**
   * Stop webcam capture and release resources
   */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      // Stop all tracks to release camera
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
    setError(null);
  }, []);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    videoRef,
    isActive,
    isLoading,
    error,
    startCamera,
    stopCamera
  };
}
