import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useCamera } from '../../camera/hooks/useCamera';
import { PoseTrackingSurface } from '../components/PoseTrackingSurface';
import { CameraControls } from '../../camera/components/CameraControls';
import {
  EXERCISE_CATALOG,
  ELBOW_FLEXION_EXTENSION_REP,
  ELBOW_ISOMETRIC_HOLD,
} from '../config/exercises';
import {
  ExerciseDefinition,
  FormStatus,
  MovementPhase,
  FeedbackCode,
  TrackingSnapshot,
} from '../types';
import { RepStateMachine } from '../services/repStateMachine';
import { poseService, MappedRehabilitationJoints } from '../../pose/services/poseService';
import { CLINICAL_VISIBILITY_THRESHOLD } from '../../../types/pose';
import { LocalizedStrings } from '../../../types/i18n';
import { en } from '../../../locales/en';
import {
  Activity,
  Camera,
  RotateCcw,
  Clock,
  Sliders,
  Beaker,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface MotionWorkbenchProps {
  t?: LocalizedStrings;
}

/**
 * Developer Diagnostics Page: Motion Workbench.
 * Reference: RehabBuddy PRD Person 3 Specification (Section 8.4 & Diagnostics Table).
 *
 * Dedicated CV testing dashboard exposing:
 * - Camera (Active / error / resolution / device)
 * - FPS (Actual measured camera & pose FPS, latency)
 * - Landmarks (Detected joints with coordinates and clinical visibility threshold)
 * - Angle (Current 2D joint angle + visual range meter)
 * - Phase (State machine phase: waiting, outbound, target, returning, holding)
 * - Repetitions (Completed reps with full-cycle Start->Target->Start verification)
 * - Hold (Monotonic hold timer: elapsed / goal / completion)
 * - Simulation Sandbox (Offline angle injection for algorithmic verification)
 */
export const MotionWorkbench: React.FC<MotionWorkbenchProps> = ({ t = en }) => {
  // 1. Camera Lifecycle
  const {
    cameraState,
    devices,
    activeDeviceId,
    resolutionPreset,
    actualResolution,
    stream,
    startCamera,
    stopCamera,
    restartCamera,
    switchCamera,
    setResolutionPreset,
  } = useCamera();

  // 2. Active Exercise Definition & Arm Selection
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    ELBOW_FLEXION_EXTENSION_REP.id
  );
  const [selectedSide, setSelectedSide] = useState<'left' | 'right'>('left');

  const baseDefinition = useMemo(() => {
    const found = EXERCISE_CATALOG.find((ex: ExerciseDefinition) => ex.id === selectedExerciseId);
    return found || ELBOW_FLEXION_EXTENSION_REP;
  }, [selectedExerciseId]);

  const activeDefinition: ExerciseDefinition = useMemo(() => {
    return {
      ...baseDefinition,
      side: selectedSide,
      angle: {
        ...baseDefinition.angle,
        proximal: selectedSide === 'right' ? 'RIGHT_SHOULDER' : 'LEFT_SHOULDER',
        vertex: selectedSide === 'right' ? 'RIGHT_ELBOW' : 'LEFT_ELBOW',
        distal: selectedSide === 'right' ? 'RIGHT_WRIST' : 'LEFT_WRIST',
      },
    };
  }, [baseDefinition, selectedSide]);

  // 3. State Machine & Metrics Tracking
  const stateMachineRef = useRef<RepStateMachine>(new RepStateMachine(activeDefinition));

  useEffect(() => {
    stateMachineRef.current.setDefinition(activeDefinition);
  }, [activeDefinition]);

  // Telemetry & Snapshot State
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [formStatus, setFormStatus] = useState<FormStatus>('neutral');
  const [movementPhase, setMovementPhase] = useState<MovementPhase>('waiting');
  const [repCount, setRepCount] = useState<number>(0);
  const [holdElapsedMs, setHoldElapsedMs] = useState<number>(0);
  const [holdComplete, setHoldComplete] = useState<boolean>(false);
  const [feedbackCode, setFeedbackCode] = useState<FeedbackCode | null>(null);
  const [mappedJoints, setMappedJoints] = useState<MappedRehabilitationJoints | null>(null);

  // Performance Telemetry
  const [cameraFps, setCameraFps] = useState<number>(0);
  const [inferenceFps, setInferenceFps] = useState<number>(0);
  const [avgLatency, setAvgLatency] = useState<number>(0);
  const [p95Latency, setP95Latency] = useState<number>(0);

  // Simulation Mode for Offline Testing
  const [simulationActive, setSimulationActive] = useState<boolean>(false);
  const [simulatedAngle, setSimulatedAngle] = useState<number>(160);
  const [simulatedConfidence, setSimulatedConfidence] = useState<number>(0.92);

  // Handle frame processed by the tracking surface
  const handleFrameProcessed = useCallback(
    (data: {
      angleDeg: number | null;
      formStatus: FormStatus;
      feedbackCode: FeedbackCode | null;
      confidence: number | null;
    }) => {
      if (simulationActive) return; // Ignore camera feed if simulation sandbox is active

      const detection = poseService.getLatestDetection();
      if (detection) {
        setCameraFps(detection.cameraFps);
        setInferenceFps(detection.inferenceFps);
        setAvgLatency(detection.avgInferenceTimeMs);
        setP95Latency(detection.p95InferenceTimeMs);
        if (detection.mappedJoints) {
          setMappedJoints(detection.mappedJoints);
        }
      }

      setCurrentAngle(data.angleDeg);

      // Step state machine
      const sm = stateMachineRef.current;
      const snapshot: TrackingSnapshot = sm.update({
        angleDeg: data.angleDeg,
        confidence: data.confidence,
        isReliable: data.confidence !== null && data.confidence >= CLINICAL_VISIBILITY_THRESHOLD,
        isPersonVisible: data.angleDeg !== null,
        missingLandmarks:
          data.confidence === null || data.confidence < CLINICAL_VISIBILITY_THRESHOLD
            ? ['elbow', 'wrist']
            : [],
        now: performance.now(),
      });

      setFormStatus(snapshot.formStatus);
      setMovementPhase(snapshot.phase);
      setRepCount(snapshot.repCount);
      setHoldElapsedMs(snapshot.holdElapsedMs);
      setHoldComplete(snapshot.holdComplete);
      setFeedbackCode(snapshot.feedbackCode as FeedbackCode | null);
    },
    [simulationActive]
  );

  // Simulation step function
  const runSimulationStep = useCallback(
    (angle: number, conf: number) => {
      setSimulatedAngle(angle);
      setSimulatedConfidence(conf);

      const sm = stateMachineRef.current;
      const isReliable = conf >= CLINICAL_VISIBILITY_THRESHOLD;

      const snapshot = sm.update({
        angleDeg: angle,
        confidence: conf,
        isReliable,
        isPersonVisible: true,
        missingLandmarks: isReliable ? [] : ['elbow', 'wrist'],
        now: performance.now(),
      });

      setCurrentAngle(angle);
      setFormStatus(snapshot.formStatus);
      setMovementPhase(snapshot.phase);
      setRepCount(snapshot.repCount);
      setHoldElapsedMs(snapshot.holdElapsedMs);
      setHoldComplete(snapshot.holdComplete);
      setFeedbackCode(snapshot.feedbackCode as FeedbackCode | null);
    },
    []
  );

  const handleResetStateMachine = () => {
    stateMachineRef.current.reset();
    setRepCount(0);
    setHoldElapsedMs(0);
    setHoldComplete(false);
    setMovementPhase('waiting');
    setFormStatus('neutral');
    setFeedbackCode(null);
  };

  // Phase badges configuration
  const phaseList: MovementPhase[] =
    activeDefinition.mode === 'rep'
      ? ['waiting', 'outbound', 'target', 'returning', 'complete']
      : ['waiting', 'outbound', 'holding', 'complete'];

  return (
    <div className="flex flex-col gap-5 text-slate-100 max-w-7xl mx-auto pb-10">
      {/* 1. Header & Clinical Safety Disclosures */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500" />
            </span>
            <span className="text-xs font-mono uppercase tracking-wider text-brand-400 font-semibold">
              Person 3 Diagnostic Workbench • Computer Vision & Pose Engine
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Motion Intelligence Workbench</span>
            <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-brand-950 text-brand-300 border border-brand-800">
              PRD FR1-FR5
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Developer testing dashboard for real-time camera lifecycle, MediaPipe landmarks, 2D vector joint-angle math, and repetition/hold state machines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Simulation Toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !simulationActive;
              setSimulationActive(next);
              if (next) {
                runSimulationStep(simulatedAngle, simulatedConfidence);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition ${
              simulationActive
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>{simulationActive ? 'Simulation Active' : 'Enable Angle Simulator'}</span>
          </button>

          {/* Reset SM */}
          <button
            type="button"
            onClick={handleResetStateMachine}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Counts</span>
          </button>
        </div>
      </div>

      {/* Medical Safety Disclaimer Alert */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
        <ShieldCheck className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-amber-300">Clinical Sandbox Notice: </span>
          All exercise configurations are marked <code className="text-amber-200 bg-amber-900/60 px-1 py-0.5 rounded font-mono">demo_unvalidated</code>. Angles (160°, 60°, tolerance 10°) are illustrative test parameters and do not constitute an approved medical prescription. 2D image-plane angle calculations carry projection limitations and do not replace clinical goniometry.
        </div>
      </div>

      {/* 2. Primary KPI Telemetry Row (PRD Section 8 Specification Table) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Camera */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-brand-400" />
            <span>Camera</span>
          </div>
          <div className="mt-2">
            <div className="text-base font-bold font-mono text-white truncate">
              {cameraState === 'active' ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Active
                </span>
              ) : cameraState === 'interrupted' ? (
                <span className="text-amber-400">Interrupted</span>
              ) : cameraState === 'permission_denied' ? (
                <span className="text-rose-400">Denied</span>
              ) : (
                <span className="text-slate-400 capitalize">{cameraState.replace('_', ' ')}</span>
              )}
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
              {actualResolution ? `${actualResolution.width}×${actualResolution.height}` : resolutionPreset}
            </div>
          </div>
        </div>

        {/* Metric 2: FPS */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-brand-400" />
            <span>FPS & Latency</span>
          </div>
          <div className="mt-2">
            <div className="text-base font-bold font-mono text-white">
              {inferenceFps} <span className="text-xs text-slate-400 font-normal">FPS</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
              Cam {cameraFps} • {avgLatency}ms (P95 {p95Latency}ms)
            </div>
          </div>
        </div>

        {/* Metric 3: Angle */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-brand-400" />
            <span>Elbow Angle</span>
          </div>
          <div className="mt-2">
            <div className="text-base font-bold font-mono text-white">
              {currentAngle !== null ? (
                <span
                  className={
                    formStatus === 'correct'
                      ? 'text-emerald-400'
                      : formStatus === 'needs-adjustment' || formStatus === 'incorrect'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }
                >
                  {Math.round(currentAngle)}°
                </span>
              ) : (
                <span className="text-slate-500">--°</span>
              )}
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
              Target: {activeDefinition.angle.targetRangeDeg[0]}°–{activeDefinition.angle.targetRangeDeg[1]}°
            </div>
          </div>
        </div>

        {/* Metric 4: Phase */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <ArrowRight className="w-3.5 h-3.5 text-brand-400" />
            <span>Movement Phase</span>
          </div>
          <div className="mt-2">
            <div className="text-xs font-bold font-mono text-brand-300 truncate">
              {movementPhase.toUpperCase()}
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">
              {activeDefinition.mode === 'rep' ? 'Rep State Machine' : 'Hold State Machine'}
            </div>
          </div>
        </div>

        {/* Metric 5: Repetitions */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5 text-brand-400" />
            <span>Repetitions</span>
          </div>
          <div className="mt-2">
            <div className="text-base font-bold font-mono text-white" data-testid="workbench-rep-count">
              <span className="text-brand-300">{repCount}</span>
              <span className="text-xs text-slate-400 font-normal"> / {activeDefinition.repGoal ?? '∞'}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
              {movementPhase === 'target' ? 'Target reached' : 'Cycle validated'}
            </div>
          </div>
        </div>

        {/* Metric 6: Hold */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-brand-400" />
            <span>Hold Elapsed</span>
          </div>
          <div className="mt-2">
            <div className="text-base font-bold font-mono text-white">
              <span className={holdComplete ? 'text-emerald-400 font-bold' : 'text-slate-100'}>
                {(holdElapsedMs / 1000).toFixed(1)}s
              </span>
              <span className="text-xs text-slate-400 font-normal">
                {' '}
                / {activeDefinition.holdSeconds ? `${activeDefinition.holdSeconds}s` : 'N/A'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
              {holdComplete ? '✓ Goal Achieved' : 'Monotonic clock'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Operational View: Video Surface (Left) + Inspector Panels (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Live Surface and Camera Controls (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl relative">
            <PoseTrackingSurface
              stream={stream}
              cameraState={cameraState}
              definition={activeDefinition}
              onFrameProcessed={handleFrameProcessed}
            />
          </div>

          {/* Camera Controls Panel */}
          <CameraControls
            cameraState={cameraState}
            devices={devices}
            activeDeviceId={activeDeviceId}
            isMirrored={true}
            resolutionPreset={resolutionPreset}
            actualResolution={actualResolution}
            t={t}
            onStart={() => startCamera(activeDeviceId || undefined)}
            onStop={stopCamera}
            onRestart={restartCamera}
            onSwitchDevice={switchCamera}
            onToggleMirror={() => {}}
            onSelectPreset={setResolutionPreset}
          />
        </div>

        {/* Right Column: Diagnostics & Exercise Controls (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Panel A: Exercise Configuration & Side Selector */}
          <div className="p-4 rounded-2xl bg-slate-900/85 border border-slate-800 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Beaker className="w-4 h-4 text-brand-400" />
                Exercise Configuration
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                Mode: {activeDefinition.mode.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Exercise Presets
                </label>
                <select
                  value={selectedExerciseId}
                  onChange={(e) => {
                    setSelectedExerciseId(e.target.value);
                    handleResetStateMachine();
                  }}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value={ELBOW_FLEXION_EXTENSION_REP.id}>Elbow Flexion-Extension (Rep)</option>
                  <option value={ELBOW_ISOMETRIC_HOLD.id}>Elbow Isometric Hold (Hold)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Active Arm
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedSide('left')}
                    className={`py-1 text-xs font-semibold rounded-lg transition ${
                      selectedSide === 'left'
                        ? 'bg-brand-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSide('right')}
                    className={`py-1 text-xs font-semibold rounded-lg transition ${
                      selectedSide === 'right'
                        ? 'bg-brand-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Right
                  </button>
                </div>
              </div>
            </div>

            {/* Range Indicator Gauge */}
            <div className="mt-1 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Angle Range Visualizer:</span>
                <span className="font-mono font-bold text-brand-300">
                  {currentAngle !== null ? `${Math.round(currentAngle)}°` : '--°'}
                </span>
              </div>

              {/* Angle bar from 0 to 180 degrees */}
              <div className="relative w-full h-4 bg-slate-800 rounded-full overflow-hidden">
                {/* Target Zone */}
                <div
                  className="absolute top-0 bottom-0 bg-emerald-500/30 border-x border-emerald-400/80"
                  style={{
                    left: `${(activeDefinition.angle.targetRangeDeg[0] / 180) * 100}%`,
                    width: `${
                      ((activeDefinition.angle.targetRangeDeg[1] -
                        activeDefinition.angle.targetRangeDeg[0]) /
                        180) *
                      100
                    }%`,
                  }}
                  title="Target Range"
                />

                {/* Start Zone */}
                <div
                  className="absolute top-0 bottom-0 bg-sky-500/30 border-x border-sky-400/80"
                  style={{
                    left: `${(activeDefinition.angle.startRangeDeg[0] / 180) * 100}%`,
                    width: `${
                      ((activeDefinition.angle.startRangeDeg[1] -
                        activeDefinition.angle.startRangeDeg[0]) /
                        180) *
                      100
                    }%`,
                  }}
                  title="Start Range"
                />

                {/* Current Angle Needle */}
                {currentAngle !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-1.5 bg-white shadow-lg transition-all duration-75"
                    style={{
                      left: `${Math.min(100, Math.max(0, (currentAngle / 180) * 100))}%`,
                    }}
                  />
                )}
              </div>

              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <span>0° (Full Flex)</span>
                <span className="text-emerald-400 font-semibold">
                  Target [{activeDefinition.angle.targetRangeDeg[0]}°–{activeDefinition.angle.targetRangeDeg[1]}°]
                </span>
                <span className="text-sky-400 font-semibold">
                  Start [{activeDefinition.angle.startRangeDeg[0]}°–{activeDefinition.angle.startRangeDeg[1]}°]
                </span>
                <span>180°</span>
              </div>
            </div>
          </div>

          {/* Panel B: State Machine Progression & Feedback Codes */}
          <div className="p-4 rounded-2xl bg-slate-900/85 border border-slate-800 shadow-xl flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-brand-400" />
                State Machine Cycle
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  formStatus === 'correct'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : formStatus === 'needs-adjustment' || formStatus === 'incorrect'
                    ? 'bg-rose-950 text-rose-300 border-rose-700'
                    : 'bg-amber-950 text-amber-300 border-amber-700'
                }`}
              >
                FORM: {formStatus.toUpperCase()}
              </span>
            </span>

            {/* Stepper */}
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {phaseList.map((ph, idx) => {
                const isActive = movementPhase === ph;
                return (
                  <div
                    key={ph}
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center transition ${
                      isActive
                        ? 'bg-brand-600/30 border-brand-500 text-white font-bold shadow-lg scale-105'
                        : 'bg-slate-950/60 border-slate-800 text-slate-500'
                    }`}
                  >
                    <span className="text-[9px] font-mono">Step {idx + 1}</span>
                    <span className="text-[10px] font-semibold mt-0.5 truncate w-full">
                      {ph === 'waiting'
                        ? 'Wait'
                        : ph === 'outbound'
                        ? 'Move'
                        : ph === 'target'
                        ? 'Target'
                        : ph === 'returning'
                        ? 'Return'
                        : ph === 'holding'
                        ? 'Hold'
                        : 'Done'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Feedback Code Box */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                  Feedback Code:
                </span>
                <span className="text-xs font-mono font-bold text-brand-300">
                  {feedbackCode || 'IDLE'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 italic">
                (Transmitted to Person 4)
              </span>
            </div>
          </div>

          {/* Panel C: Simulation Sandbox (Offline Angle Testing) */}
          {simulationActive && (
            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-800/60 shadow-xl flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-amber-800/40">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  Angle Injection Sandbox
                </span>
                <span className="text-[10px] font-mono text-amber-400">DEMO / MOCK • Offline Test Mode</span>
              </div>

              {/* Slider for angle */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-slate-300">Injected Joint Angle:</span>
                  <span className="font-mono font-bold text-amber-300">{simulatedAngle}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={simulatedAngle}
                  onChange={(e) => runSimulationStep(Number(e.target.value), simulatedConfidence)}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Slider for confidence */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-slate-300">Injected Landmark Visibility:</span>
                  <span
                    className={`font-mono font-bold ${
                      simulatedConfidence >= CLINICAL_VISIBILITY_THRESHOLD
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {simulatedConfidence.toFixed(2)}
                    {simulatedConfidence < CLINICAL_VISIBILITY_THRESHOLD && ' (Gated: Insufficient Data)'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={simulatedConfidence}
                  onChange={(e) => runSimulationStep(simulatedAngle, Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Quick cycle simulation buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => runSimulationStep(160, simulatedConfidence)}
                  className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Start (160°)
                </button>
                <button
                  type="button"
                  onClick={() => runSimulationStep(60, simulatedConfidence)}
                  className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Target (60°)
                </button>
                <button
                  type="button"
                  onClick={() => runSimulationStep(simulatedAngle, 0.4)}
                  className="px-2 py-1 text-[11px] rounded bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900"
                >
                  Drop Conf (0.40)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Landmarks Inspector (Detected Body Joints) */}
      <div className="p-4 rounded-2xl bg-slate-900/85 border border-slate-800 shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-brand-400" />
            Landmarks & Body Joint Diagnostics
          </span>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>Threshold: <strong className="text-emerald-400">≥ {CLINICAL_VISIBILITY_THRESHOLD}</strong></span>
            <span className="text-slate-600">|</span>
            <span>Gating: <strong className="text-amber-400">&lt; 0.65 ➔ insufficient_data</strong></span>
          </div>
        </div>

        {/* Joint Grid Table */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Left Shoulder', joint: mappedJoints?.leftShoulder },
            { label: 'Right Shoulder', joint: mappedJoints?.rightShoulder },
            { label: 'Left Elbow', joint: mappedJoints?.leftElbow },
            { label: 'Right Elbow', joint: mappedJoints?.rightElbow },
            { label: 'Left Wrist', joint: mappedJoints?.leftWrist },
            { label: 'Right Wrist', joint: mappedJoints?.rightWrist },
            { label: 'Left Hip', joint: mappedJoints?.leftHip },
            { label: 'Right Hip', joint: mappedJoints?.rightHip },
            { label: 'Left Knee', joint: mappedJoints?.leftKnee },
            { label: 'Right Knee', joint: mappedJoints?.rightKnee },
            { label: 'Left Ankle', joint: mappedJoints?.leftAnkle },
            { label: 'Right Ankle', joint: mappedJoints?.rightAnkle },
          ].map((item) => {
            const vis = item.joint?.visibility ?? 0;
            const isReliable = vis >= CLINICAL_VISIBILITY_THRESHOLD;

            return (
              <div
                key={item.label}
                className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                  item.joint
                    ? isReliable
                      ? 'bg-slate-950/80 border-slate-800 text-slate-200'
                      : 'bg-amber-950/20 border-amber-800/50 text-amber-200'
                    : 'bg-slate-950/40 border-slate-900 text-slate-600'
                }`}
              >
                <div className="flex justify-between items-center text-[11px] font-semibold">
                  <span className="truncate">{item.label}</span>
                  {item.joint && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isReliable ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                      }`}
                    />
                  )}
                </div>

                <div className="mt-1 text-[10px] font-mono space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vis:</span>
                    <span
                      className={
                        !item.joint
                          ? 'text-slate-600'
                          : isReliable
                          ? 'text-emerald-400 font-bold'
                          : 'text-amber-400 font-bold'
                      }
                    >
                      {item.joint ? vis.toFixed(2) : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>X: {item.joint ? item.joint.x.toFixed(2) : '--'}</span>
                    <span>Y: {item.joint ? item.joint.y.toFixed(2) : '--'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
