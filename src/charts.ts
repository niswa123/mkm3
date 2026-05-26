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

export class TimeChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private datasets: LineDataSet[] = [];
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setupRetinaScaling();
  }

  private setupRetinaScaling() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    // Set display size
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    // Set actual scale
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    this.ctx.scale(dpr, dpr);
  }

  public resize() {
    this.setupRetinaScaling();
    this.draw();
  }

  public updateData(datasets: LineDataSet[]) {
    this.datasets = datasets;
    this.draw();
  }

  public draw() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    
    this.ctx.clearRect(0, 0, width, height);

    // Dark grid theme colors
    const bg = '#0d1117';
    const grid = '#21262d';
    const text = '#8b949e';

    // Draw background
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, width, height);

    // Padding
    const padLeft = 45;
    const padRight = 15;
    const padTop = 30;
    const padBottom = 25;
    
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    if (plotW <= 0 || plotH <= 0) return;

    // Draw Border
    this.ctx.strokeStyle = grid;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // 1. Find Min/Max bounds of data
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    let hasData = false;
    for (const ds of this.datasets) {
      if (ds.points.length > 0) hasData = true;
      for (const p of ds.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }

    // Default bounds if no data
    if (!hasData || minX === maxX) {
      minX = 0;
      maxX = 10;
    }
    if (!hasData || minY === maxY) {
      minY = -1;
      maxY = 1;
    }

    // Add padding to Y bounds for breathing room
    const ySpan = maxY - minY;
    minY -= ySpan * 0.05;
    maxY += ySpan * 0.05;

    // Draw Grid Lines & Axes Labels
    this.ctx.font = '10px sans-serif';
    this.ctx.fillStyle = text;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    // Y Grid Lines & Labels (5 ticks)
    const yTicks = 5;
    for (let i = 0; i < yTicks; i++) {
      const ratio = i / (yTicks - 1);
      const val = maxY - ratio * (maxY - minY);
      const yPos = padTop + ratio * plotH;

      // Draw grid line
      this.ctx.strokeStyle = grid;
      this.ctx.beginPath();
      this.ctx.moveTo(padLeft, yPos);
      this.ctx.lineTo(width - padRight, yPos);
      this.ctx.stroke();

      // Label (format nicely)
      this.ctx.fillText(val.toFixed(2), padLeft - 8, yPos);
    }

    // X Grid Lines & Labels (5 ticks)
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    const xTicks = 5;
    for (let i = 0; i < xTicks; i++) {
      const ratio = i / (xTicks - 1);
      const val = minX + ratio * (maxX - minX);
      const xPos = padLeft + ratio * plotW;

      // Draw grid line
      this.ctx.strokeStyle = grid;
      this.ctx.beginPath();
      this.ctx.moveTo(xPos, padTop);
      this.ctx.lineTo(xPos, height - padBottom);
      this.ctx.stroke();

      // Label
      this.ctx.fillText(val.toFixed(1) + 's', xPos, height - padBottom + 5);
    }

    // 2. Plot lines
    this.ctx.save();
    // Clip drawing area inside plot border
    this.ctx.beginPath();
    this.ctx.rect(padLeft, padTop, plotW, plotH);
    this.ctx.clip();

    for (const ds of this.datasets) {
      if (ds.points.length < 2) continue;

      this.ctx.strokeStyle = ds.color;
      this.ctx.lineWidth = 1.8;

      if (ds.glow) {
        this.ctx.shadowColor = ds.color;
        this.ctx.shadowBlur = 4;
      } else {
        this.ctx.shadowBlur = 0;
      }

      this.ctx.beginPath();
      for (let i = 0; i < ds.points.length; i++) {
        const p = ds.points[i];
        const xPos = padLeft + ((p.x - minX) / (maxX - minX)) * plotW;
        const yPos = padTop + (1 - (p.y - minY) / (maxY - minY)) * plotH;

        if (i === 0) {
          this.ctx.moveTo(xPos, yPos);
        } else {
          this.ctx.lineTo(xPos, yPos);
        }
      }
      this.ctx.stroke();
    }
    this.ctx.restore();

    // 3. Draw Legend at the top
    this.ctx.shadowBlur = 0;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    let legendX = padLeft + 10;
    
    for (const ds of this.datasets) {
      // Draw indicator circle
      this.ctx.fillStyle = ds.color;
      this.ctx.beginPath();
      this.ctx.arc(legendX, padTop / 2, 4, 0, 2 * Math.PI);
      this.ctx.fill();

      // Label
      this.ctx.fillStyle = text;
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText(ds.label, legendX + 8, padTop / 2);

      legendX += this.ctx.measureText(ds.label).width + 30;
    }
  }
}

export class XYChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private points: PlotPoint[] = [];
  private color: string = '#00ffcc';
  private labelX: string = 'X';
  private labelY: string = 'Y';
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setupRetinaScaling();
  }

  private setupRetinaScaling() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    this.ctx.scale(dpr, dpr);
  }

  public resize() {
    this.setupRetinaScaling();
    this.draw();
  }

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
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    
    this.ctx.clearRect(0, 0, width, height);

    const bg = '#0d1117';
    const grid = '#21262d';
    const axis = '#30363d';
    const text = '#8b949e';

    // Draw background
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, width, height);

    // Padding
    const pad = 30;
    const plotW = width - 2 * pad;
    const plotH = height - 2 * pad;

    if (plotW <= 0 || plotH <= 0) return;

    // Draw Border
    this.ctx.strokeStyle = grid;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(pad, pad, plotW, plotH);

    // Find symmetrical bounds to keep center at (0,0)
    let maxVal = 0.1; // minimum limit
    for (const p of this.points) {
      const absX = Math.abs(p.x);
      const absY = Math.abs(p.y);
      if (absX > maxVal) maxVal = absX;
      if (absY > maxVal) maxVal = absY;
    }
    
    // Add 10% padding
    maxVal *= 1.1;

    // Grid coordinates
    const minX = -maxVal;
    const maxX = maxVal;
    const minY = -maxVal;
    const maxY = maxVal;

    // Draw Center Axes (0,0)
    const centerX = pad + plotW / 2;
    const centerY = pad + plotH / 2;

    this.ctx.strokeStyle = axis;
    this.ctx.lineWidth = 1.2;
    
    // X Axis
    this.ctx.beginPath();
    this.ctx.moveTo(pad, centerY);
    this.ctx.lineTo(width - pad, centerY);
    this.ctx.stroke();

    // Y Axis
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, pad);
    this.ctx.lineTo(centerX, height - pad);
    this.ctx.stroke();

    // Grid labels
    this.ctx.font = '9px sans-serif';
    this.ctx.fillStyle = text;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    
    // Ticks & Labels
    this.ctx.fillText(`+${maxVal.toFixed(2)}`, centerX + 5, pad + 2);
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(`-${maxVal.toFixed(2)}`, centerX + 5, height - pad - 2);
    
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText(`-${maxVal.toFixed(2)}`, centerX - 5, centerY - 2);
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`+${maxVal.toFixed(2)}`, width - pad - 35, centerY - 2);

    // Axis Labels
    this.ctx.font = '10px sans-serif';
    this.ctx.fillStyle = '#58a6ff';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(this.labelX, width - pad - 5, centerY + 5);

    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(this.labelY, centerX + 8, pad + 5);

    // Draw data points with fading trail (old points are transparent)
    if (this.points.length >= 2) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(pad, pad, plotW, plotH);
      this.ctx.clip();

      this.ctx.lineWidth = 1.5;
      
      // Draw path in chunks of size 50 with decreasing opacity for fading effect
      const total = this.points.length;
      const chunkSize = Math.max(5, Math.ceil(total / 30));
      
      for (let i = 0; i < total - 1; i += chunkSize) {
        const start = i;
        const end = Math.min(i + chunkSize + 1, total - 1);
        
        // Calculate age opacity: newer points (closer to total) are more opaque
        const ageRatio = end / total; // 0 to 1
        const opacity = 0.05 + 0.95 * ageRatio * ageRatio; // quadratic fade
        
        this.ctx.strokeStyle = this.color;
        this.ctx.globalAlpha = opacity;
        
        this.ctx.beginPath();
        for (let j = start; j <= end; j++) {
          const p = this.points[j];
          const xPos = pad + ((p.x - minX) / (maxX - minX)) * plotW;
          const yPos = pad + (1 - (p.y - minY) / (maxY - minY)) * plotH;
          
          if (j === start) {
            this.ctx.moveTo(xPos, yPos);
          } else {
            this.ctx.lineTo(xPos, yPos);
          }
        }
        this.ctx.stroke();
      }

      // Draw active bob on the graph as a glowing neon dot
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
