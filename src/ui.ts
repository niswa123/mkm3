/**
 * UI controller for 3D Pendulum Lab
 * Manages event bindings, slider telemetry sync, tab switching, CSV export, and dynamic physics equations display.
 */

import { exactPeriod, huygensPeriod } from './physics';

export type LabMode = 'mode1' | 'mode2' | 'mode3' | 'mode4';

export class LabUI {
  public activeMode: LabMode = 'mode1';
  
  // DOM element caches
  private elements: Record<string, HTMLElement> = {};

  constructor() {
    this.cacheElements();
    this.bindGlobalSliders();
    this.bindTabs();
    this.renderEquations();
  }

  private cacheElements() {
    const ids = [
      // Badges
      'current-mode-badge',
      // Sliders & Values
      'input-l', 'val-l',
      'input-g', 'val-g',
      'input-m', 'val-m',
      'input-phi0', 'val-phi0',
      'input-dt', 'val-dt',
      'input-alpha', 'val-alpha',
      'input-omega', 'val-omega',
      'input-latitude', 'val-latitude',
      'input-x0', 'val-x0',
      'input-y0', 'val-y0',
      'input-a', 'val-a',
      'input-epsilon', 'val-epsilon',
      // Containers
      'fields-mode2', 'fields-mode3', 'fields-mode4',
      'container-m', 'container-phi0',
      'section-integrator', 'period-analysis-card',
      // Telemetry
      'tel-time', 'tel-angle', 'tel-speed', 'tel-energy', 'tel-energy-item',
      // Equations Content
      'dynamic-math-content',
      // Period metrics
      't-huygens', 'err-huygens',
      't-elliptic',
      't-numeric', 'err-numeric',
      'note-dt',
      // Chart elements
      'xy-chart-title'
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) this.elements[id] = el;
    }
  }

  // Gets value of any slider
  public getVal(id: string): number {
    const el = this.elements[id] as HTMLInputElement;
    return el ? parseFloat(el.value) : 0;
  }

  // Sets text in telemetry or analytics
  public setHTML(id: string, text: string) {
    const el = this.elements[id];
    if (el) el.innerHTML = text;
  }

  // Synchronizes slider inputs with their text spans
  private bindGlobalSliders() {
    const pairs = [
      { slider: 'input-l', val: 'val-l', format: (v: number) => v.toFixed(2) },
      { slider: 'input-g', val: 'val-g', format: (v: number) => v.toFixed(2) },
      { slider: 'input-m', val: 'val-m', format: (v: number) => v.toFixed(2) },
      { slider: 'input-phi0', val: 'val-phi0', format: (v: number) => Math.round(v).toString() },
      { slider: 'input-dt', val: 'val-dt', format: (v: number) => v.toFixed(4) },
      { slider: 'input-alpha', val: 'val-alpha', format: (v: number) => v.toFixed(2) },
      { slider: 'input-omega', val: 'val-omega', format: (v: number) => v.toFixed(3) },
      { slider: 'input-latitude', val: 'val-latitude', format: (v: number) => Math.round(v).toString() },
      { slider: 'input-x0', val: 'val-x0', format: (v: number) => v.toFixed(2) },
      { slider: 'input-y0', val: 'val-y0', format: (v: number) => v.toFixed(2) },
      { slider: 'input-a', val: 'val-a', format: (v: number) => v.toFixed(2) },
      { slider: 'input-epsilon', val: 'val-epsilon', format: (v: number) => v.toFixed(2) }
    ];

    for (const p of pairs) {
      const slider = this.elements[p.slider] as HTMLInputElement;
      if (slider) {
        slider.addEventListener('input', () => {
          this.setHTML(p.val, p.format(parseFloat(slider.value)));
          
          // If in mode 1, update the static theoretical periods instantly
          if (this.activeMode === 'mode1' && (p.slider === 'input-l' || p.slider === 'input-g' || p.slider === 'input-phi0')) {
            this.updateTheoreticalPeriods();
          }
        });
      }
    }
  }

  // Controls tab navigation toggling and panel exposure
  private bindTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const mode = tab.getAttribute('data-mode') as LabMode;
        this.activeMode = mode;
        
        // Update badge
        const badges: Record<LabMode, string> = {
          mode1: 'Режим: Проект 1.9',
          mode2: 'Режим: Проект 1.11',
          mode3: 'Режим: Проект 1.12',
          mode4: 'Режим: Проект 1.15'
        };
        this.setHTML('current-mode-badge', badges[mode]);

        // Show/hide specific fields
        this.toggleFields();
        this.renderEquations();

        // Dispatch a custom event to notify main runner that the mode changed
        const event = new CustomEvent('modechange', { detail: { mode } });
        window.dispatchEvent(event);
      });
    });
  }

  private toggleFields() {
    // Hidden areas by default
    const fields2 = this.elements['fields-mode2'];
    const fields3 = this.elements['fields-mode3'];
    const fields4 = this.elements['fields-mode4'];
    const contM = this.elements['container-m'];
    const contPhi0 = this.elements['container-phi0'];
    const intSec = this.elements['section-integrator'];
    const perCard = this.elements['period-analysis-card'];
    const labelPhi0 = this.elements['label-phi0'];
    const xyTitle = this.elements['xy-chart-title'];
    const sliderPhi0 = this.elements['input-phi0'] as HTMLInputElement;

    if (fields2) fields2.style.display = 'none';
    if (fields3) fields3.style.display = 'none';
    if (fields4) fields4.style.display = 'none';
    if (contM) contM.style.display = 'flex';
    if (contPhi0) contPhi0.style.display = 'flex';
    if (intSec) intSec.style.display = 'block';
    if (perCard) perCard.style.display = 'none';

    if (labelPhi0) labelPhi0.innerHTML = 'Начальный угол (φ₀):';
    if (xyTitle) xyTitle.innerHTML = 'Фазовая плоскость (φ, φ̇)';

    if (this.activeMode === 'mode1') {
      if (perCard) perCard.style.display = 'flex';
      this.updateTheoreticalPeriods();
    } else if (this.activeMode === 'mode2') {
      if (fields2) fields2.style.display = 'grid';
    } else if (this.activeMode === 'mode3') {
      if (fields3) fields3.style.display = 'grid';
      if (contM) contM.style.display = 'none';
      if (contPhi0) contPhi0.style.display = 'none';
      if (xyTitle) xyTitle.innerHTML = 'Траектория в плоскости (X, Y)';
    } else if (this.activeMode === 'mode4') {
      if (fields4) fields4.style.display = 'grid';
      if (labelPhi0) labelPhi0.innerHTML = 'Начальное отклонение (φ₀):';
      if (sliderPhi0) {
        // Parametric resonance requires small initial angle (e.g. 0.1 deg)
        // Let's set slider input to 0.1 degree if it is too large
        if (parseFloat(sliderPhi0.value) > 5) {
          sliderPhi0.value = '0.1';
          this.setHTML('val-phi0', '0.1');
        }
      }
    }
  }

  // Renders professional formulas based on course manual
  private renderEquations() {
    let content = '';

    if (this.activeMode === 'mode1') {
      content = `
        <div class="math-text">Колебания нелинейного маятника при больших начальных углах <span class="math-var">φ₀</span>.</div>
        <div class="math-block">
          <div class="math-block-title">Уравнение движения:</div>
          φ̈ = -(g/l) * sin(φ)
        </div>
        <div class="math-block">
          <div class="math-block-title">Формула Гюйгенса (малые углы):</div>
          T = 2π * √(l/g)
        </div>
        <div class="math-block">
          <div class="math-block-title">Эллиптическая формула периода:</div>
          T = 4 * √(l/g) * K(k),  где k = sin(φ₀/2)
        </div>
      `;
    } else if (this.activeMode === 'mode2') {
      content = `
        <div class="math-text">Движение в диссипативной среде с силой сопротивления, пропорциональной скорости.</div>
        <div class="math-block">
          <div class="math-block-title">Дифференциальное уравнение:</div>
          ml² * φ̈ + αl² * φ̇ + mgl * sin(φ) = 0
          
          <div class="math-block-title" style="margin-top:4px;">В форме ускорения:</div>
          φ̈ = -(g/l) * sin(φ) - 2λ * φ̇,  где λ = α/(2m)
        </div>
        <div class="math-text">Траектория затухающих колебаний на фазовой плоскости стягивается в логарифмическую спираль.</div>
      `;
    } else if (this.activeMode === 'mode3') {
      content = `
        <div class="math-text">Исследование 3D маятника во вращающейся системе отсчета (эффект силы Кориолиса).</div>
        <div class="math-block">
          <div class="math-block-title">Вектор силы Кориолиса:</div>
          F_coriolis = 2 * m * (v × ω_земли)
        </div>
        <div class="math-block">
          <div class="math-block-title">Вектор ускорения в 3D (Декартовы координаты):</div>
          a_bob = 2 * (v × ω_земли) - (N/l) * r - g
          где N = v²/l + g*cos(φ) - сила натяжения нити
        </div>
        <div class="math-text">Здесь <span class="math-var">ψ</span> - географическая широта, задающая проекции вектора <span class="math-var">ω_земли</span>.</div>
      `;
    } else if (this.activeMode === 'mode4') {
      content = `
        <div class="math-text">Параметрический резонанс маятника при вертикальных гармонических колебаниях точки подвеса.</div>
        <div class="math-block">
          <div class="math-block-title">Уравнение движения:</div>
          φ̈ + (g/l) * [1 + (a * ω² / g) * sin(ω * t)] * sin(φ) = 0
        </div>
        <div class="math-block">
          <div class="math-block-title">Частота параметрической накачки:</div>
          ω = 2 * ω₀ * ε,  где ω₀ = √(g/l) - собств. частота
        </div>
        <div class="math-text">При <span class="math-var">ε ≈ 1</span> малые начальные отклонения экспоненциально раскачиваются.</div>
      `;
    }

    this.setHTML('dynamic-math-content', content);
  }

  // Computes theoretical periods statically when sliders move
  public updateTheoreticalPeriods() {
    if (this.activeMode !== 'mode1') return;
    const l = this.getVal('input-l');
    const g = this.getVal('input-g');
    const phi0Deg = this.getVal('input-phi0');
    const phi0Rad = (phi0Deg * Math.PI) / 180;

    const tHuy = huygensPeriod(l, g);
    const tExact = exactPeriod(l, g, phi0Rad);

    this.setHTML('t-huygens', `${tHuy.toFixed(5)} с`);
    this.setHTML('t-elliptic', `${tExact.toFixed(5)} с`);

    // Huygens absolute error relative to exact period
    const relErr = Math.abs((tHuy - tExact) / tExact) * 100;
    this.setHTML('err-huygens', `+${relErr.toFixed(2)}%`);
  }

  // Updates Period Analytics Row for Numerical Crossing
  public updateNumericalPeriodTelemetry(tNum: number) {
    if (this.activeMode !== 'mode1') {
      this.setHTML('t-numeric', '-');
      this.setHTML('err-numeric', '-');
      return;
    }

    const l = this.getVal('input-l');
    const g = this.getVal('input-g');
    const phi0Deg = this.getVal('input-phi0');
    const phi0Rad = (phi0Deg * Math.PI) / 180;
    const tExact = exactPeriod(l, g, phi0Rad);

    if (tNum <= 0) {
      this.setHTML('t-numeric', 'Вычисление...');
      this.setHTML('err-numeric', '-');
      return;
    }

    this.setHTML('t-numeric', `${tNum.toFixed(5)} с`);
    
    // Relative numerical error
    const relErr = Math.abs((tNum - tExact) / tExact) * 100;
    
    let colorClass = 'success';
    if (relErr > 0.5) colorClass = 'err';
    
    this.setHTML('err-numeric', `<span class="${colorClass}">${relErr > 1e-4 ? relErr.toFixed(4) : relErr.toExponential(2)}%</span>`);
    
    // Update step size note
    const dt = this.getVal('input-dt');
    this.setHTML('note-dt', dt.toString());
  }

  // Telemetry Dashboard Bindings
  public updateTelemetry(t: number, angleDeg: number, speedRad: number, energyJ: number) {
    this.setHTML('tel-time', `${t.toFixed(2)}s`);
    this.setHTML('tel-angle', `${angleDeg.toFixed(1)}°`);
    this.setHTML('tel-speed', `${speedRad.toFixed(2)} rad/s`);
    
    const energyItem = this.elements['tel-energy-item'];
    if (this.activeMode === 'mode3') {
      // In Foucault 3D energy calculation is complicated, we hide it or show simplified bob kinetic+potential
      if (energyItem) energyItem.style.display = 'none';
    } else {
      if (energyItem) energyItem.style.display = 'flex';
      this.setHTML('tel-energy', `${energyJ.toFixed(3)} J`);
    }
  }

  // Dynamic Damping Type reader
  public getDampingType(): 'linear' | 'quadratic' {
    const radios = document.getElementsByName('damping-type');
    for (let i = 0; i < radios.length; i++) {
      const r = radios[i] as HTMLInputElement;
      if (r.checked) return r.value as 'linear' | 'quadratic';
    }
    return 'linear';
  }

  // Dynamic Integrator Solver Type reader
  public getSolverType(): 'verlet' | 'rk4' | 'euler-cromer' {
    const el = this.elements['select-solver'] as HTMLSelectElement;
    return el ? (el.value as 'verlet' | 'rk4' | 'euler-cromer') : 'verlet';
  }

  // Expose CSV file download trigger
  public triggerCSVExport(data: { t: number; val1: number; val2: number; energy: number }[], columns: string[]) {
    if (data.length === 0) {
      alert('Нет данных для экспорта! Пожалуйста, сначала запустите симуляцию.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += columns.join(',') + '\n';

    for (const row of data) {
      csvContent += `${row.t.toFixed(4)},${row.val1.toFixed(6)},${row.val2.toFixed(6)},${row.energy.toFixed(6)}\n`;
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pendulum_simulation_${this.activeMode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
