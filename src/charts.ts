/**
 * High-Performance HTML5 Canvas Plotting Module
 * Provides zero-overhead, beautiful dark-themed scientific line plots & phase portraits.
 */

export interface PlotPoint {
  x: number;
  y: number;
}

export interface LineDataSet {
  label: string;
  points: PlotPoint[];
  color: string;
  glow?: boolean;
}

// Абстрактный базовый класс для устранения дублирования холста (ООП-Наследование)
abstract class BaseChart {
  protected ctx: CanvasRenderingContext2D;

  constructor(protected canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.syncSize();
  }

  // Просто измеряем размеры контейнера на экране и задаем их холсту
  protected syncSize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  public resize() {
    this.syncSize();
    this.draw();
  }

  public abstract draw(): void;
}

export class TimeChart extends BaseChart {
  private datasets: LineDataSet[] = [];

  public updateData(datasets: LineDataSet[]) {
    this.datasets = datasets;
    this.draw();
  }

  public draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    this.ctx.clearRect(0, 0, width, height);

    const bg = '#0d1117';
    const gridColor = '#21262d';
    const textColor = '#8b949e';

    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, width, height);

    const padLeft = 45, padRight = 15, padTop = 30, padBottom = 25;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    if (plotW <= 0 || plotH <= 0) return;

    // Отрисовка рамки графика
    this.ctx.strokeStyle = gridColor;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // 1. Поиск границ данных (Ультра-компактный поиск границ)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.datasets.forEach(ds => ds.points.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }));
    const hasData = minX !== Infinity;

    if (!hasData || minX === maxX) { minX = 0; maxX = 10; }
    if (!hasData || minY === maxY) { minY = -1; maxY = 1; }

    const ySpan = maxY - minY;
    minY -= ySpan * 0.05;
    maxY += ySpan * 0.05;

    this.ctx.font = '10px sans-serif';
    this.ctx.fillStyle = textColor;
    this.ctx.strokeStyle = gridColor;

    // Пакетное рисование сетки Y и подписей
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    this.ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ratio = i / 4;
      const yPos = padTop + ratio * plotH;
      this.ctx.moveTo(padLeft, yPos);
      this.ctx.lineTo(width - padRight, yPos);

      const val = maxY - ratio * (maxY - minY);
      this.ctx.fillText(val.toFixed(2), padLeft - 8, yPos);
    }
    this.ctx.stroke();

    // Пакетное рисование сетки X и подписей
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ratio = i / 4;
      const xPos = padLeft + ratio * plotW;
      this.ctx.moveTo(xPos, padTop);
      this.ctx.lineTo(xPos, height - padBottom);

      const val = minX + ratio * (maxX - minX);
      this.ctx.fillText(val.toFixed(1) + 's', xPos, height - padBottom + 5);
    }
    this.ctx.stroke();

    // 2. Отрисовка линий графиков
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(padLeft, padTop, plotW, plotH);
    this.ctx.clip();

    this.datasets.forEach(ds => {
      if (ds.points.length < 2) return;
      this.ctx.strokeStyle = ds.color;
      this.ctx.lineWidth = 1.8;
      this.ctx.shadowBlur = ds.glow ? 4 : 0;
      this.ctx.shadowColor = ds.color;

      this.ctx.beginPath();
      ds.points.forEach((p, idx) => {
        const xPos = padLeft + ((p.x - minX) / (maxX - minX)) * plotW;
        const yPos = padTop + (1 - (p.y - minY) / (maxY - minY)) * plotH;
        if (idx === 0) this.ctx.moveTo(xPos, yPos);
        else this.ctx.lineTo(xPos, yPos);
      });
      this.ctx.stroke();
    });
    this.ctx.restore();

    // 3. Рисование легенды
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    let legendX = padLeft + 10;
    
    for (const ds of this.datasets) {
      this.ctx.fillStyle = ds.color;
      this.ctx.beginPath();
      this.ctx.arc(legendX, padTop / 2, 4, 0, 2 * Math.PI);
      this.ctx.fill();

      this.ctx.fillStyle = textColor;
      this.ctx.fillText(ds.label, legendX + 8, padTop / 2);
      legendX += this.ctx.measureText(ds.label).width + 30;
    }
  }
}

export class XYChart extends BaseChart {
  private points: PlotPoint[] = [];
  private color: string = '#00ffcc';
  private labelX: string = 'X';
  private labelY: string = 'Y';

  public setLabels(labelX: string, labelY: string) {
    this.labelX = labelX;
    this.labelY = labelY;
  }

  public updateData(points: PlotPoint[], color: string = '#00ffcc') {
    this.points = points;
    this.color = color;
    this.draw();
  }

  public draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    this.ctx.clearRect(0, 0, width, height);

    const bg = '#0d1117', grid = '#21262d', axis = '#30363d', text = '#8b949e';

    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, width, height);

    const pad = 30;
    const plotW = width - 2 * pad;
    const plotH = height - 2 * pad;

    if (plotW <= 0 || plotH <= 0) return;

    this.ctx.strokeStyle = grid;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(pad, pad, plotW, plotH);

    // Ультра-компактный расчет симметричных границ осей
    let maxVal = 0.1;
    this.points.forEach(p => maxVal = Math.max(maxVal, Math.abs(p.x), Math.abs(p.y)));
    maxVal *= 1.1;

    const minX = -maxVal, maxX = maxVal, minY = -maxVal, maxY = maxVal;
    const centerX = pad + plotW / 2;
    const centerY = pad + plotH / 2;

    this.ctx.strokeStyle = axis;
    this.ctx.lineWidth = 1.2;
    
    // Прорисовка осей X и Y
    this.ctx.beginPath();
    this.ctx.moveTo(pad, centerY);
    this.ctx.lineTo(width - pad, centerY);
    this.ctx.moveTo(centerX, pad);
    this.ctx.lineTo(centerX, height - pad);
    this.ctx.stroke();

    // Разметка шкал
    this.ctx.font = '9px sans-serif';
    this.ctx.fillStyle = text;
    this.ctx.textAlign = 'left';
    
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(`+${maxVal.toFixed(2)}`, centerX + 5, pad + 2);
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(`-${maxVal.toFixed(2)}`, centerX + 5, height - pad - 2);
    
    this.ctx.textAlign = 'right';
    this.ctx.fillText(`-${maxVal.toFixed(2)}`, centerX - 5, centerY - 2);
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`+${maxVal.toFixed(2)}`, width - pad - 35, centerY - 2);

    // Подписи осей
    this.ctx.font = '10px sans-serif';
    this.ctx.fillStyle = '#58a6ff';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(this.labelX, width - pad - 5, centerY + 5);

    this.ctx.textAlign = 'left';
    this.ctx.fillText(this.labelY, centerX + 8, pad + 5);

    // Отрисовка траектории
    if (this.points.length >= 2) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(pad, pad, plotW, plotH);
      this.ctx.clip();

      this.ctx.lineWidth = 1.5;
      const total = this.points.length;
      const chunkSize = Math.max(5, Math.ceil(total / 30));
      
      for (let i = 0; i < total - 1; i += chunkSize) {
        const start = i, end = Math.min(i + chunkSize + 1, total - 1);
        this.ctx.strokeStyle = this.color;
        this.ctx.globalAlpha = 0.05 + 0.95 * Math.pow(end / total, 2);
        
        this.ctx.beginPath();
        for (let j = start; j <= end; j++) {
          const p = this.points[j];
          const xPos = pad + ((p.x - minX) / (maxX - minX)) * plotW;
          const yPos = pad + (1 - (p.y - minY) / (maxY - minY)) * plotH;
          if (j === start) this.ctx.moveTo(xPos, yPos);
          else this.ctx.lineTo(xPos, yPos);
        }
        this.ctx.stroke();
      }

      // Неоновая светящаяся точка в конце
      const latest = this.points[total - 1];
      const activeX = pad + ((latest.x - minX) / (maxX - minX)) * plotW;
      const activeY = pad + (1 - (latest.y - minY) / (maxY - minY)) * plotH;
      
      this.ctx.globalAlpha = 1.0;
      this.ctx.fillStyle = this.color;
      this.ctx.shadowColor = this.color;
      this.ctx.shadowBlur = 6;
      this.ctx.beginPath();
      this.ctx.arc(activeX, activeY, 4, 0, 2 * Math.PI);
      this.ctx.fill();

      this.ctx.restore();
    }
  }
}
