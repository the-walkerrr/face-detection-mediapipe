/**
 * Proctoring Test Harness - Main Page
 * 
 * PURPOSE:
 * Diagnostic sandbox for validating client-side proctoring checks.
 * NOT production proctoring - purely for performance testing.
 * 
 * WHAT THIS PAGE VALIDATES:
 * - Webcam feed visualization
 * - Real-time face detection flags
 * - CPU/memory/FPS impact
 * - Safety mechanism behavior
 * 
 * PERFORMANCE CONSTRAINTS ENFORCED:
 * - Throttled to 2 FPS (500ms intervals)
 * - No requestAnimationFrame loops
 * - Auto-disable on CPU overload
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useWebcam } from '@/hooks/useWebcam';
import { createFrameProcessor } from '@/lib/frameProcessor';
import {
  createInitialState,
  processAnalysis,
  getFlagMessage,
  getFlagSeverity
} from '@/lib/flagManager';

export default function ProctoringTestPage() {
  // Webcam management
  const { videoRef, isActive, isLoading, error: cameraError, startCamera, stopCamera } = useWebcam();

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [flagState, setFlagState] = useState(createInitialState);
  const [lastProcessingTime, setLastProcessingTime] = useState(null);
  const [isDisabled, setIsDisabled] = useState(false);
  const [disableReason, setDisableReason] = useState(null);
  const [initError, setInitError] = useState(null);

  // Frame processor ref (stable across renders)
  const processorRef = useRef(null);

  /**
   * Handle analysis results from frame processor
   */
  const handleAnalysis = useCallback((analysis) => {
    setFlagState(prev => processAnalysis(prev, analysis));
    setLastProcessingTime(analysis.processingTime);
  }, []);

  /**
   * Handle auto-disable from frame processor
   */
  const handleDisabled = useCallback((reason) => {
    setIsDisabled(true);
    setDisableReason(reason);
    setIsAnalyzing(false);
  }, []);

  /**
   * Handle errors from frame processor
   */
  const handleError = useCallback((error) => {
    console.error('[Page] Processor error:', error);
    setInitError(error.message);
  }, []);

  /**
   * Start analysis when camera is active
   */
  const startAnalysis = useCallback(() => {
    if (!isActive || !videoRef.current || isAnalyzing) return;

    setInitError(null);
    setIsDisabled(false);
    setDisableReason(null);

    // Create processor if needed
    if (!processorRef.current) {
      processorRef.current = createFrameProcessor({
        videoElement: videoRef.current,
        onAnalysis: handleAnalysis,
        onDisabled: handleDisabled,
        onError: handleError
      });
    }

    processorRef.current.start();
    setIsAnalyzing(true);
  }, [isActive, isAnalyzing, videoRef, handleAnalysis, handleDisabled, handleError]);

  /**
   * Stop analysis
   */
  const stopAnalysis = useCallback(async () => {
    if (processorRef.current) {
      await processorRef.current.cleanup();
      processorRef.current = null;
    }
    setIsAnalyzing(false);
    setFlagState(createInitialState());
    setLastProcessingTime(null);
  }, []);

  /**
   * Start camera and analysis together
   */
  const handleStart = useCallback(async () => {
    await startCamera();
  }, [startCamera]);

  /**
   * Stop everything
   */
  const handleStop = useCallback(async () => {
    await stopAnalysis();
    stopCamera();
  }, [stopAnalysis, stopCamera]);

  // Auto-start analysis when camera becomes active
  useEffect(() => {
    if (isActive && !isAnalyzing && !isDisabled) {
      // Small delay to ensure video is ready
      const timer = setTimeout(startAnalysis, 500);
      return () => clearTimeout(timer);
    }
  }, [isActive, isAnalyzing, isDisabled, startAnalysis]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (processorRef.current) {
        processorRef.current.cleanup();
      }
    };
  }, []);

  return (
    <>
      <Head>
        <title>Proctoring Test Harness</title>
        <meta name="description" content="Client-side proctoring validation sandbox" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <header className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Proctoring Test Harness</h1>
            <p className="text-gray-400 text-sm">
              Diagnostic sandbox for client-side proctoring checks.
              Performance experiment, not production.
            </p>
          </header>

          {/* Video Feed Section */}
          <section className="mb-6">
            <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3] max-w-[320px] mx-auto border-2 border-gray-700">
              {/* Video Element */}
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Placeholder when camera is off */}
              {!isActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center">
                    <svg
                      className="w-12 h-12 mx-auto mb-2 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-gray-500 text-sm">Camera Off</p>
                  </div>
                </div>
              )}

              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800/80">
                  <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                    <p className="text-sm">Requesting camera...</p>
                  </div>
                </div>
              )}

              {/* Analysis indicator */}
              {isAnalyzing && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-green-600/80 px-2 py-1 rounded text-xs">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Analyzing
                </div>
              )}
            </div>

            {/* Camera controls */}
            <div className="flex justify-center gap-3 mt-4">
              {!isActive ? (
                <button
                  onClick={handleStart}
                  disabled={isLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  {isLoading ? 'Starting...' : 'Start Camera'}
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                >
                  Stop Camera
                </button>
              )}
            </div>

            {/* Camera error */}
            {cameraError && (
              <div className="mt-3 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-center">
                Camera error: {cameraError}
              </div>
            )}
          </section>

          {/* Status Panel */}
          <section className="bg-gray-800 rounded-lg border-2 border-gray-700 overflow-hidden">
            <div className="px-4 py-3 bg-gray-750 border-b border-gray-700">
              <h2 className="font-semibold">Detection Status</h2>
            </div>

            <div className="p-4 space-y-3">
              {/* Auto-disable warning */}
              {isDisabled && (
                <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium text-red-300">Analysis Disabled</span>
                  </div>
                  <p className="text-sm text-red-400 mt-1">{disableReason}</p>
                </div>
              )}

              {/* Init error */}
              {initError && (
                <div className="p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg">
                  <p className="text-sm text-yellow-300">Initialization error: {initError}</p>
                </div>
              )}

              {/* Current flags */}
              {flagState.currentFlags.length > 0 ? (
                <ul className="space-y-2">
                  {flagState.currentFlags.map((flag) => (
                    <li
                      key={flag}
                      className={`p-3 rounded-lg flex items-center gap-2 ${getFlagSeverity(flag) === 'ok'
                        ? 'bg-green-900/30 border border-green-700'
                        : getFlagSeverity(flag) === 'error'
                          ? 'bg-red-900/30 border border-red-700'
                          : 'bg-yellow-900/30 border border-yellow-700'
                        }`}
                    >
                      {/* Status icon */}
                      <span className={`w-3 h-3 rounded-full ${getFlagSeverity(flag) === 'ok'
                        ? 'bg-green-500'
                        : getFlagSeverity(flag) === 'error'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                        }`} />
                      <span className="font-medium">
                        {getFlagMessage(flag)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-gray-500 text-center py-4">
                  {isActive ? 'Initializing detection...' : 'Start camera to begin analysis'}
                </div>
              )}

              {/* Detection counts */}
              {isAnalyzing && (
                <div className="pt-3 border-t border-gray-700">
                  <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">{flagState.faceCount}</div>
                    <div className="text-xs text-gray-400 mt-1">Faces Detected</div>
                  </div>
                </div>
              )}

              {/* Performance metrics */}
              {isAnalyzing && lastProcessingTime !== null && (
                <div className="pt-3 border-t border-gray-700">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>Processing time:</span>
                    <span className={lastProcessingTime > 200 ? 'text-yellow-400' : 'text-green-400'}>
                      {lastProcessingTime.toFixed(1)}ms
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-400 mt-1">
                    <span>Sample rate:</span>
                    <span>2 FPS (500ms interval)</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* History Panel */}
          {flagState.history.length > 0 && (
            <section className="mt-6 bg-gray-800 rounded-lg border-2 border-gray-700 overflow-hidden">
              <div className="px-4 py-3 bg-gray-750 border-b border-gray-700">
                <h2 className="font-semibold">Flag History (Last 20)</h2>
              </div>
              <div className="p-4 max-h-48 overflow-y-auto">
                <ul className="space-y-1 text-sm font-mono">
                  {flagState.history.slice().reverse().map((entry, idx) => (
                    <li key={idx} className="text-gray-400">
                      <span className="text-gray-600">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      {' '}
                      <span className={
                        entry.flags.includes('FACE_OK') ? 'text-green-400' :
                          entry.flags.includes('MULTIPLE_FACES') ? 'text-red-400' :
                            'text-yellow-400'
                      }>
                        {entry.flags.join(', ')}
                      </span>
                      {' '}
                      <span className="text-gray-600">
                        (faces: {entry.details.faceCount}, brightness: {entry.details.brightness})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <footer className="mt-8 text-center text-gray-600 text-sm">
            <p>Performance experiment • Not production proctoring</p>
            <p className="mt-1">MediaPipe FaceDetector • Throttled to 2 FPS</p>
          </footer>
        </div>
      </main>
    </>
  );
}
