/**
 * UI-контроллер для 3D Лаборатории Математического Маятника
 * Отвечает за:
 * 1. Поиск и кэширование DOM-элементов страницы (кнопок, ползунков, таблиц).
 * 2. Синхронизацию значений ползунков с текстовыми полями вывода.
 * 3. Переключение вкладок проектов (режимов) с динамическим скрытием/показом нужных полей.
 * 4. Генерацию и отображение формул из методички по физике.
 * 5. Расчет теоретических периодов колебаний (формулы Гюйгенса и точного эллиптического интеграла).
 * 6. Вывод погрешностей численных методов в реальном времени.
 */

import { exactPeriod, huygensPeriod } from './physics';

// Описание типов для вкладки активного режима
export type LabMode = 'mode1' | 'mode2' | 'mode3' | 'mode4';

export class LabUI {
  // Активный в данный момент проект (по умолчанию 1.9)
  public activeMode: LabMode = 'mode1';

  // Словарь (кэш) для хранения ссылок на HTML-элементы, чтобы не искать их каждый раз
  private elements: Record<string, HTMLElement> = {};

  constructor() {
    this.cacheElements();        // Находим все нужные элементы на странице
    this.bindGlobalSliders();    // Подключаем слушатели событий к ползункам
    this.bindTabs();             // Подключаем логику переключения вкладок
    this.renderEquations();      // Выводим формулы для стартового режима
  }

  /**
   * Находит элементы по их ID на HTML-странице и сохраняет их в словарь elements.
   * Это существенно ускоряет работу программы при частых обновлениях интерфейса.
   */
  private cacheElements() {
    const ids = [
      // Бейджи
      'current-mode-badge',
      // Слайдеры (ползунки) и текстовые выводы значений
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
      // Блоки-контейнеры для группировки настроек
      'fields-mode2', 'fields-mode3', 'fields-mode4',
      'container-m', 'container-phi0',
      'section-integrator', 'period-analysis-card',
      'select-solver',
      // Телеметрия (показания датчиков в 3D)
      'tel-time', 'tel-angle', 'tel-speed', 'tel-energy', 'tel-energy-item',
      // Контейнер для вывода формул
      'dynamic-math-content',
      // Ячейки таблицы анализа периодов
      't-huygens', 'err-huygens',
      't-elliptic',
      't-numeric', 'err-numeric',
      'note-dt',
      // Элементы графиков
      'xy-chart-title', 'label-phi0'
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) this.elements[id] = el;
    }
  }

  /**
   * Считывает числовое значение с любого ползунка (слайдера) по его ID.
   * @param id Идентификатор слайдера
   */
  public getVal(id: string): number {
    const el = this.elements[id] as HTMLInputElement;
    return el ? parseFloat(el.value) : 0;
  }

  /**
   * Записывает текстовое значение внутрь HTML-элемента с указанным ID.
   * @param id Идентификатор элемента
   * @param text Выводимый текст
   */
  public setHTML(id: string, text: string) {
    const el = this.elements[id];
    if (el) el.innerHTML = text;
  }

  /**
   * Подключает события изменения ('input') ко всем ползункам параметров.
   * При сдвиге ползунка значение мгновенно форматируется и выводится текстом на экран.
   */
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

          // Если мы в первой лабораторной работе, пересчитываем периоды Гюйгенса и эллиптический прямо при движении ползунка
          if (this.activeMode === 'mode1' && (p.slider === 'input-l' || p.slider === 'input-g' || p.slider === 'input-phi0')) {
            this.updateTheoreticalPeriods();
          }
        });
      }
    }
  }

  /**
   * Подключает события клика на вкладки выбора проектов.
   * Управляет переключением классов активности (.active) и обновляет шапку.
   */
  private bindTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const mode = tab.getAttribute('data-mode') as LabMode;
        this.activeMode = mode;

        // Красивое текстовое обновление бейджа текущего проекта
        const badges: Record<LabMode, string> = {
          mode1: 'Режим: Проект 1.9',
          mode2: 'Режим: Проект 1.11',
          mode3: 'Режим: Проект 1.12',
          mode4: 'Режим: Проект 1.15'
        };
        this.setHTML('current-mode-badge', badges[mode]);

        this.toggleFields();     // Скрываем ненужные ползунки, показываем нужные
        this.renderEquations();  // Меняем формулы на экране под выбранную работу

        // Отправляем глобальное событие 'modechange' для сброса симуляции в main.ts
        const event = new CustomEvent('modechange', { detail: { mode } });
        window.dispatchEvent(event);
      });
    });
  }

  /**
   * Управляет динамической перестройкой полей настроек на боковой панели.
   * Скрывает лишние параметры, чтобы студент не запутался при защите работы,
   * и выводит только те ползунки, которые требуются для текущего проекта методички.
   */
  private toggleFields() {
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

    // Сбрасываем отображение всех специфичных блоков полей
    if (fields2) fields2.style.display = 'none';
    if (fields3) fields3.style.display = 'none';
    if (fields4) fields4.style.display = 'none';
    if (contM) contM.style.display = 'none';            // По умолчанию скрываем массу
    if (contPhi0) contPhi0.style.display = 'flex';
    if (intSec) intSec.style.display = 'none';          // Выбор численного метода скрыт полностью
    if (perCard) perCard.style.display = 'none';

    if (labelPhi0) labelPhi0.innerHTML = 'Начальный угол (φ₀):';
    if (xyTitle) xyTitle.innerHTML = 'Фазовая плоскость (φ, φ̇)';

    if (this.activeMode === 'mode1') {
      // Для работы 1.9 выводим таблицу сравнения теоретических и численного периодов
      if (perCard) perCard.style.display = 'flex';
      this.updateTheoreticalPeriods();
    } else if (this.activeMode === 'mode2') {
      // Для затухания выводим коэффициент затухания альфа и слайдер массы груза
      if (fields2) fields2.style.display = 'grid';
      if (contM) contM.style.display = 'flex';
    } else if (this.activeMode === 'mode3') {
      // Для маятника Фуко выводим параметры Земли и координаты X0/Y0, скрыв начальный угол
      if (fields3) fields3.style.display = 'grid';
      if (contPhi0) contPhi0.style.display = 'none';
      if (xyTitle) xyTitle.innerHTML = 'Траектория в плоскости (X, Y)';
    } else if (this.activeMode === 'mode4') {
      // Для резонанса настраиваем малые начальные раскачки
      if (fields4) fields4.style.display = 'grid';
      if (labelPhi0) labelPhi0.innerHTML = 'Начальное отклонение (φ₀):';
      if (sliderPhi0) {
        // Параметрический резонанс требует очень маленького угла (по методичке - 0.1 градус)
        if (parseFloat(sliderPhi0.value) > 5) {
          sliderPhi0.value = '0.1';
          this.setHTML('val-phi0', '0.1');
        }
      }
    }
  }

  /**
   * Генерирует и выводит красивый HTML-блок с теоретическими формулами из методички
   * в зависимости от выбранного студентом проекта.
   */
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

  /**
   * Рассчитывает теоретический период колебаний статически при изменении слайдеров.
   * Вычисляет Гюйгенсовский период и строгий период через полный эллиптический интеграл 1-го рода.
   * Сравнивает их и выводит относительную погрешность Гюйгенса.
   */
  public updateTheoreticalPeriods() {
    if (this.activeMode !== 'mode1') return;
    const l = this.getVal('input-l');
    const g = this.getVal('input-g');
    const phi0Deg = this.getVal('input-phi0');
    const phi0Rad = (phi0Deg * Math.PI) / 180; // Перевод угла в радианы для интеграла

    const tHuy = huygensPeriod(l, g);
    const tExact = exactPeriod(l, g, phi0Rad);

    this.setHTML('t-huygens', `${tHuy.toFixed(5)} с`);
    this.setHTML('t-elliptic', `${tExact.toFixed(5)} с`);

    // Абсолютная погрешность Гюйгенса по сравнению с эллиптическим интегралом
    const relErr = Math.abs((tHuy - tExact) / tExact) * 100;
    this.setHTML('err-huygens', `+${relErr.toFixed(2)}%`);
  }

  /**
   * Обновляет строку численного периода в таблице анализа (Проект 1.9).
   * Выводит зафиксированный симуляцией период и его относительную ошибку по сравнению с теорией.
   * @param tNum Найденный численный период (время между засечками равновесия)
   */
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
    
    // Относительная погрешность численного шага относительно эллиптического интеграла
    const relErr = Math.abs((tNum - tExact) / tExact) * 100;
    
    let colorClass = 'success';
    if (relErr > 0.5) colorClass = 'err'; // Если погрешность велика, красим красным
    
    // Вывод в экспоненциальной или классической форме в зависимости от величины ошибки
    this.setHTML('err-numeric', `<span class="${colorClass}">${relErr > 1e-4 ? relErr.toFixed(4) : relErr.toExponential(2)}%</span>`);
    
    const dt = this.getVal('input-dt');
    this.setHTML('note-dt', dt.toString());
  }

  /**
   * Обновляет плашку реального времени (t, Angle, Speed, Energy) поверх 3D окна.
   */
  public updateTelemetry(t: number, angleDeg: number, speedRad: number, energyJ: number) {
    this.setHTML('tel-time', `${t.toFixed(2)}s`);
    this.setHTML('tel-angle', `${angleDeg.toFixed(1)}°`);
    this.setHTML('tel-speed', `${speedRad.toFixed(2)} rad/s`);
    
    const energyItem = this.elements['tel-energy-item'];
    if (this.activeMode === 'mode3') {
      // В режиме маятника Фуко 3D энергия не выводится на плашке (сложный многомерный потенциал)
      if (energyItem) energyItem.style.display = 'none';
    } else {
      if (energyItem) energyItem.style.display = 'flex';
      this.setHTML('tel-energy', `${energyJ.toFixed(3)} J`);
    }
  }

  /**
   * Считывает выбранный характер силы сопротивления (линейное или квадратичное затухание).
   */
  public getDampingType(): 'linear' | 'quadratic' {
    const radios = document.getElementsByName('damping-type');
    for (let i = 0; i < radios.length; i++) {
      const r = radios[i] as HTMLInputElement;
      if (r.checked) return r.value as 'linear' | 'quadratic';
    }
    return 'linear';
  }

  /**
   * Возвращает выбранный тип численного интегратора из скрытого селектора (всегда возвращает RK4).
   */
  public getSolverType(): 'verlet' | 'rk4' | 'euler-cromer' {
    const el = this.elements['select-solver'] as HTMLSelectElement;
    return el ? (el.value as 'verlet' | 'rk4' | 'euler-cromer') : 'rk4';
  }
}
