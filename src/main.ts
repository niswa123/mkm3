import './style.css';
import { LabUI } from './ui';
import { PendulumVisualizer } from './visualizer';
import { TimeChart, XYChart } from './charts';
import type { PlotPoint, LineDataSet } from './charts';
import { 
  SinglePendulumSolver, 
  FoucaultSolver, 
  Vector3D 
} from './physics';
import type { 
  SinglePendulumParams, 
  FoucaultParams 
} from './physics';

// Global Simulation State
class SimulationController {
  private ui: LabUI;
  private visualizer: PendulumVisualizer;
  private timeChart: TimeChart;
  private xyChart: XYChart;
  
  // Playback control
  private isRunning = false;
  private lastFrameTime = 0;
  private accumTime = 0;
  private speedMultiplier = 1; // Playback speed scaler
  
  // Physical State Variables
  private t = 0;
  
  // Single Pendulum Coordinates (mode1, mode2, mode4)
  private phi = 0;
  private dphi = 0;
  
  // Foucault Coordinates (mode3)
  private x = 0.5;
  private y = 0.0;
  private vx = 0.0;
  private vy = 0.0;
  private z = 0.0;
  private vz = 0.0;

  // Trackers for Numerical Period (Project 1.9 equilibrium crossings)
  private lastPhi = 0;
  private lastCrossingTime = -1;
  private calculatedPeriods: number[] = [];
  private currentNumericalPeriod = 0;

  // History buffers for plotting & CSV export
  private history: { t: number; val1: number; val2: number; energy: number }[] = [];
  private maxHistoryLength = 2000;

  constructor() {
    this.ui = new LabUI();
    
    // Instantiating custom visualizer
    const visDiv = document.getElementById('visualizer-container') as HTMLDivElement;
    this.visualizer = new PendulumVisualizer(visDiv);

    // Instantiating Canvas charts
    const timeCanvas = document.getElementById('time-chart') as HTMLCanvasElement;
    const xyCanvas = document.getElementById('xy-chart') as HTMLCanvasElement;
    this.timeChart = new TimeChart(timeCanvas);
    this.xyChart = new XYChart(xyCanvas);

    this.bindControls();
    this.resetSimulation();
    
    // Resize handler for Canvas charts
    window.addEventListener('resize', () => {
      this.timeChart.resize();
      this.xyChart.resize();
    });

    // Custom Mode Switch event listener from UI
    window.addEventListener('modechange', () => {
      this.resetSimulation();
    });

    // Animation frame loop
    requestAnimationFrame(this.loop.bind(this));
  }

  private bindControls() {
    // 1. Play/Pause
    const playBtn = document.getElementById('btn-play-pause') as HTMLButtonElement;
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.isRunning = !this.isRunning;
        if (this.isRunning) {
          playBtn.innerHTML = 'Пауза';
          playBtn.classList.add('paused');
          this.lastFrameTime = performance.now();
        } else {
          playBtn.innerHTML = 'Запустить';
          playBtn.classList.remove('paused');
        }
      });
    }

    // 2. Step one frame
    const stepBtn = document.getElementById('btn-step') as HTMLButtonElement;
    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        if (!this.isRunning) {
          this.physicsStep();
          this.updateVisuals();
        }
      });
    }

    // 3. Reset
    const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetSimulation();
      });
    }

    // 4. Export CSV
    const exportBtn = document.getElementById('btn-export-csv') as HTMLButtonElement;
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const columns = ['Time(s)', 'Position', 'Velocity', 'Energy'];
        this.ui.triggerCSVExport(this.history, columns);
      });
    }

    // 5. Visualizer Float Overlays
    const resetCamBtn = document.getElementById('btn-reset-camera') as HTMLButtonElement;
    if (resetCamBtn) {
      resetCamBtn.addEventListener('click', () => {
        // Camera reset triggered automatically by visualizer inner reset listener
        window.dispatchEvent(new CustomEvent('resetcamera'));
      });
    }

    const clearTrailBtn = document.getElementById('btn-btn-clear-trail') || document.getElementById('btn-clear-trail') as HTMLButtonElement;
    if (clearTrailBtn) {
      clearTrailBtn.addEventListener('click', () => {
        this.visualizer.clearTrail();
      });
    }

    const vectorBtn = document.getElementById('btn-toggle-vectors') as HTMLButtonElement;
    if (vectorBtn) {
      vectorBtn.addEventListener('click', () => {
        vectorBtn.classList.toggle('active');
        const show = vectorBtn.classList.contains('active');
        this.visualizer.toggleVectors(show);
      });
    }

    const trailBtn = document.getElementById('btn-toggle-trail') as HTMLButtonElement;
    if (trailBtn) {
      trailBtn.addEventListener('click', () => {
        trailBtn.classList.toggle('active');
        const show = trailBtn.classList.contains('active');
        this.visualizer.toggleTrail(show);
      });
    }
  }

  // Resets the coordinates & history
  private resetSimulation() {
    this.t = 0;
    this.isRunning = false;
    
    const playBtn = document.getElementById('btn-play-pause') as HTMLButtonElement;
    if (playBtn) {
      playBtn.innerHTML = 'Запустить';
      playBtn.classList.remove('paused');
    }

    this.history = [];
    this.visualizer.clearTrail();

    // Reset numerical period variables
    this.lastCrossingTime = -1;
    this.calculatedPeriods = [];
    this.currentNumericalPeriod = 0;

    const mode = this.ui.activeMode;
    const phi0Deg = this.ui.getVal('input-phi0');
    
    if (mode === 'mode3') {
      // Foucault Mode Initial Conditions (Page 44)
      this.x = this.ui.getVal('input-x0');
      this.y = this.ui.getVal('input-y0');
      this.vx = 0.0;
      this.vy = 0.0;
      
      const l = this.ui.getVal('input-l');
      const rz_rel = -Math.sqrt(l * l - (this.x * this.x + this.y * this.y));
      this.z = l + rz_rel;
      this.vz = 0.0;
      this.lastPhi = this.x;
    } else {
      // Single Degrees of Freedom Modes
      this.phi = (phi0Deg * Math.PI) / 180;
      this.dphi = 0.0;
      this.lastPhi = this.phi;
    }

    this.ui.updateTheoreticalPeriods();
    this.ui.updateNumericalPeriodTelemetry(0);
    this.updateVisuals();
  }

  // Single step of numerical integration physics calculations
  private physicsStep() {
    const mode = this.ui.activeMode;
    const dt = this.ui.getVal('input-dt');
    const solver = this.ui.getSolverType();

    if (mode === 'mode3') {
      // 1. Foucault Pendulum (Project 1.12)
      const p: FoucaultParams = {
        l: this.ui.getVal('input-l'),
        g: this.ui.getVal('input-g'),
        omegaEarth: this.ui.getVal('input-omega'),
        latitude: this.ui.getVal('input-latitude')
      };

      const next = FoucaultSolver.stepRK4(this.x, this.y, this.vx, this.vy, this.t, dt, p);
      this.x = next.x;
      this.y = next.y;
      this.vx = next.vx;
      this.vy = next.vy;
      this.z = next.z;
      this.vz = next.vz;
      
      this.t += dt;

      // Foucault energy estimation
      const vSq = this.vx * this.vx + this.vy * this.vy + this.vz * this.vz;
      const kinetic = 0.5 * vSq; // per unit mass
      const potential = p.g * this.z;
      const energy = kinetic + potential;

      // Add to history
      this.history.push({ t: this.t, val1: this.x, val2: this.y, energy });
      if (this.history.length > this.maxHistoryLength) this.history.shift();

    } else {
      // 2. Single degrees of freedom solvers
      const p: SinglePendulumParams = {
        l: this.ui.getVal('input-l'),
        g: this.ui.getVal('input-g'),
        m: this.ui.getVal('input-m'),
        alpha: mode === 'mode2' ? this.ui.getVal('input-alpha') : 0.0,
        isQuadratic: mode === 'mode2' && this.ui.getDampingType() === 'quadratic',
        isParametric: mode === 'mode4',
        paramAmp: mode === 'mode4' ? this.ui.getVal('input-a') * this.ui.getVal('input-l') : 0.0,
        paramFreq: 0.0
      };

      // Parametric resonance calculations
      if (mode === 'mode4') {
        const omega0 = Math.sqrt(p.g / p.l);
        const eps = this.ui.getVal('input-epsilon');
        p.paramFreq = 2 * omega0 * eps; // resonance pump frequency
      }

      const next = SinglePendulumSolver.step(this.phi, this.dphi, this.t, dt, p, solver);
      this.phi = next.phi;
      this.dphi = next.dphi;
      
      const energy = SinglePendulumSolver.getEnergy(this.phi, this.dphi, this.t, p);
      
      this.t += dt;

      // Numerical Period Crossing Interpolation (Project 1.9)
      // Check if bob crossed the vertical equilibrium point (phi = 0)
      // Specifically in the downward direction (crossing 0 from positive to negative)
      if (mode === 'mode1' && this.lastPhi > 0 && this.phi <= 0) {
        // Linear interpolation of precise crossing time (Page 41)
        const tCrossing = (this.t - dt) + dt * this.lastPhi / (this.lastPhi - this.phi);
        
        if (this.lastCrossingTime !== -1) {
          const currentPeriod = tCrossing - this.lastCrossingTime;
          this.calculatedPeriods.push(currentPeriod);
          if (this.calculatedPeriods.length > 5) this.calculatedPeriods.shift();
          
          // Average the last few crossings for extreme precision
          this.currentNumericalPeriod = this.calculatedPeriods.reduce((a, b) => a + b, 0) / this.calculatedPeriods.length;
          this.ui.updateNumericalPeriodTelemetry(this.currentNumericalPeriod);
        }
        
        this.lastCrossingTime = tCrossing;
      }
      this.lastPhi = this.phi;

      // Add to history
      this.history.push({ t: this.t, val1: this.phi, val2: this.dphi, energy });
      if (this.history.length > this.maxHistoryLength) this.history.shift();
    }
  }

  // Updates Three.js render and Canvas charts
  private updateVisuals() {
    const mode = this.ui.activeMode;
    const l = this.ui.getVal('input-l');

    // 1. Feed visuals
    if (mode === 'mode3') {
      // Foucault mode: position vector relative to suspension (0, 0, l)
      const rVec = new Vector3D(this.x, this.y, this.z - l);
      const vVec = new Vector3D(this.vx, this.vy, this.vz);
      
      // Calculate Coriolis force vector
      const latRad = (this.ui.getVal('input-latitude') * Math.PI) / 180;
      const omegaEarth = this.ui.getVal('input-omega');
      const omega = new Vector3D(
        0, 
        omegaEarth * Math.cos(latRad), 
        omegaEarth * Math.sin(latRad)
      );
      const coriolisForce = vVec.cross(omega).scale(2); // acceleration

      // String tension magnitude
      const cosPhi = Math.abs(rVec.z) / l;
      const gVal = this.ui.getVal('input-g');
      const N = vVec.magnitudeSq() / l + gVal * cosPhi;
      const tensionForce = rVec.scale(-N / l); // Tension vector

      this.visualizer.updateState(rVec, tensionForce, coriolisForce);
      
      // Update UI telemetry
      const angleRad = Math.asin(Math.sqrt(this.x*this.x + this.y*this.y) / l);
      this.ui.updateTelemetry(
        this.t, 
        (angleRad * 180) / Math.PI, 
        vVec.magnitude() / l, 
        0
      );

    } else {
      // Single Degrees of Freedom mode
      // Calculate Bob 3D coordinates relative to suspension point
      // x = l * sin(phi), y = 0, z = -l * cos(phi)
      // We map physical 2D coordinates to 3D: physics Y -> 3D Z
      const rVec = new Vector3D(
        l * Math.sin(this.phi),
        0,
        -l * Math.cos(this.phi)
      );

      // Velocity in 3D: v = l * dphi
      const vMag = l * this.dphi;

      // Force calculations for single pendulum
      const gVal = this.ui.getVal('input-g');
      const mVal = this.ui.getVal('input-m');
      
      // Tension magnitude: T = m * (v^2/l + g * cos(phi))
      const tensionMag = mVal * ((this.dphi * this.dphi * l) + gVal * Math.cos(this.phi));
      const tensionForce = rVec.scale(-tensionMag / l); // Tension vector along string

      // Parametric offset for ceiling movement
      let z_susp = 0;
      if (mode === 'mode4') {
        const omega0 = Math.sqrt(gVal / l);
        const eps = this.ui.getVal('input-epsilon');
        const amp = this.ui.getVal('input-a') * l;
        z_susp = amp * Math.sin(2 * omega0 * eps * this.t);
      }

      this.visualizer.updateState(rVec, tensionForce, new Vector3D(0, 0, 0), z_susp);

      // Update UI telemetry
      const energy = SinglePendulumSolver.getEnergy(this.phi, this.dphi, this.t, {
        l, g: gVal, m: mVal, alpha: 0, isQuadratic: false, isParametric: mode === 'mode4',
        paramAmp: mode === 'mode4' ? this.ui.getVal('input-a') * l : 0.0,
        paramFreq: mode === 'mode4' ? 2 * Math.sqrt(gVal / l) * this.ui.getVal('input-epsilon') : 0.0
      });
      this.ui.updateTelemetry(this.t, (this.phi * 180) / Math.PI, this.dphi, energy);
    }

    // 2. Feed Canvas Charts (only redraw if history has points)
    if (this.history.length > 1) {
      this.updateCharts();
    }
  }

  // Updates canvas plots
  private updateCharts() {
    const mode = this.ui.activeMode;
    const size = this.history.length;
    
    // Gather last 350 points for rolling time chart to keep it extremely fast
    const maxPoints = 350;
    const sliceStart = Math.max(0, size - maxPoints);
    const chartHistory = this.history.slice(sliceStart);

    // Dynamic scale variables
    let legendLabel1 = 'Угол (рад)';
    let legendLabel2 = 'Ск-сть (рад/с)';
    
    if (mode === 'mode3') {
      legendLabel1 = 'Координата X (м)';
      legendLabel2 = 'Координата Y (м)';
    }

    const series1: PlotPoint[] = chartHistory.map(h => ({ x: h.t, y: h.val1 }));
    const series2: PlotPoint[] = chartHistory.map(h => ({ x: h.t, y: h.val2 }));
    const series3: PlotPoint[] = chartHistory.map(h => ({ x: h.t, y: h.energy }));

    const datasets: LineDataSet[] = [
      { label: legendLabel1, points: series1, color: '#00ffcc', glow: true },
      { label: legendLabel2, points: series2, color: '#3388ff' }
    ];

    // Energy graph is only for non-Foucault single degree modes
    if (mode !== 'mode3') {
      datasets.push({ label: 'Энергия E (Дж)', points: series3, color: '#ff9900' });
    }

    this.timeChart.updateData(datasets);

    // Update Phase Portrait / XY plot
    // For XY plot we draw the trail of points
    const xyPoints: PlotPoint[] = this.history.map(h => ({ x: h.val1, y: h.val2 }));
    
    if (mode === 'mode3') {
      this.xyChart.setLabels('X (м)', 'Y (м)');
      // For Foucault we color it cyan
      this.xyChart.updateData(xyPoints, '#00ffcc');
    } else {
      this.xyChart.setLabels('Угол φ (рад)', 'Ск-сть φ̇ (рад/с)');
      
      // Select different colors based on damping transitions or modes
      let color = '#00ffcc';
      if (mode === 'mode2') {
        const alpha = this.ui.getVal('input-alpha');
        color = alpha > 1.5 ? '#ff3366' : '#00ffcc'; // change color for high damping
      }
      
      this.xyChart.updateData(xyPoints, color);
    }
  }

  // Animation Loop (requestAnimationFrame)
  private loop(timestamp: number) {
    if (!this.lastFrameTime) this.lastFrameTime = timestamp;
    
    if (this.isRunning) {
      const elapsedMs = timestamp - this.lastFrameTime;
      
      // Guard against background tab freezing pauses
      const elapsed = Math.min(0.1, elapsedMs / 1000) * this.speedMultiplier;
      
      this.accumTime += elapsed;
      
      // Step physics at fixed intervals (substepping) to ensure numerical stability!
      const dt = this.ui.getVal('input-dt');
      
      // Cap number of steps per frame to avoid "spiral of death" on lag spikes
      let steps = 0;
      while (this.accumTime >= dt && steps < 12) {
        this.physicsStep();
        this.accumTime -= dt;
        steps++;
      }

      this.updateVisuals();
    }
    
    this.lastFrameTime = timestamp;
    requestAnimationFrame(this.loop.bind(this));
  }
}

// Start Application on Load
window.addEventListener('DOMContentLoaded', () => {
  new SimulationController();
});
