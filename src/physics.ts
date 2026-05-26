/**
 * 3D Mathematical Pendulum Physics Engine
 * Rigorous physical equations & numerical solvers based on the course manual.
 */

export class Vector3D {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}

  add(v: Vector3D): Vector3D {
    return new Vector3D(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vector3D): Vector3D {
    return new Vector3D(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s: number): Vector3D {
    return new Vector3D(this.x * s, this.y * s, this.z * s);
  }

  dot(v: Vector3D): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vector3D): Vector3D {
    return new Vector3D(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  magnitudeSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  magnitude(): number {
    return Math.sqrt(this.magnitudeSq());
  }

  normalize(): Vector3D {
    const mag = this.magnitude();
    if (mag === 0) return new Vector3D(0, 0, 0);
    return this.scale(1 / mag);
  }

  clone(): Vector3D {
    return new Vector3D(this.x, this.y, this.z);
  }
}

// Complete Elliptic Integral of the First Kind K(k)
// Polynomial approximation from the manual (Page 41)
export function ellipticIntegralK(k: number): number {
  const kSq = k * k;
  const t = 1 - kSq;
  if (t <= 0) return Infinity; // Singularity at phi_0 = PI

  const t1 = (((0.01451196212 * t + 0.03742563713) * t + 
                0.03590092383) * t + 0.09666344259) * t + 1.38629436112;
  
  const t2 = (((0.00441787012 * t + 0.03328355346) * t + 
                0.06880248576) * t + 0.12498593597) * t + 0.5;
  
  return t1 - t2 * Math.log(t);
}

// Huygens period formula for small angles
export function huygensPeriod(l: number, g: number): number {
  return 2 * Math.PI * Math.sqrt(l / g);
}

// Exact period using the elliptic integral
export function exactPeriod(l: number, g: number, phi0: number): number {
  if (Math.abs(phi0) < 1e-6) return huygensPeriod(l, g);
  if (Math.abs(phi0) >= Math.PI) return Infinity;
  const k = Math.sin(Math.abs(phi0) / 2);
  const K = ellipticIntegralK(k);
  return 4 * Math.sqrt(l / g) * K;
}

// Physics Configuration Types
export type SolverType = 'euler-cromer' | 'verlet' | 'rk4';

export interface SinglePendulumParams {
  l: number;       // length (m)
  g: number;       // gravity (m/s^2)
  m: number;       // mass (kg)
  alpha: number;   // damping coefficient (kg/s)
  isQuadratic: boolean; // linear or quadratic damping
  // Parametric resonance params
  isParametric: boolean;
  paramAmp: number; // suspension oscillation amplitude a (m)
  paramFreq: number; // suspension oscillation frequency (rad/s)
}

export interface FoucaultParams {
  l: number;       // length (m)
  g: number;       // gravity (m/s^2)
  omegaEarth: number; // earth rotation speed (rad/s), scaled for visualization
  latitude: number; // latitude in degrees
}

export class SinglePendulumSolver {
  // Solves: d^2(phi)/dt^2 = f(phi, dphi/dt, t)
  static getAcceleration(phi: number, dphi: number, t: number, p: SinglePendulumParams): number {
    let acc = 0;
    
    if (p.isParametric) {
      // Parametric resonance equation (Project 1.15)
      // z_susp(t) = a * sin(omega * t)
      // d^2(phi)/dt^2 = - (g/l) * (1 + (a * omega^2 / g) * sin(omega * t)) * sin(phi)
      const omegaSq = p.paramFreq * p.paramFreq;
      const factor = 1 + (p.paramAmp * omegaSq / p.g) * Math.sin(p.paramFreq * t);
      acc = -(p.g / p.l) * factor * Math.sin(phi);
    } else {
      // Standard pendulum (Project 1.9)
      acc = -(p.g / p.l) * Math.sin(phi);
    }

    // Add damping (Project 1.11)
    if (p.alpha > 0) {
      if (p.isQuadratic) {
        // Quadratic damping: F_damp = -beta * v * |v|
        // v = l * dphi
        // acc_damp = -(alpha/m) * dphi * |dphi| * l
        acc -= (p.alpha / p.m) * dphi * Math.abs(dphi) * p.l;
      } else {
        // Linear damping: F_damp = -alpha * v
        // acc_damp = -(alpha/m) * dphi
        acc -= (p.alpha / p.m) * dphi;
      }
    }

    return acc;
  }

  static getEnergy(phi: number, dphi: number, t: number, p: SinglePendulumParams): number {
    const v = p.l * dphi;
    const kinetic = 0.5 * p.m * v * v;
    
    // In parametric mode, the suspension point moves, so the potential energy is measured relative to it
    let z_susp = 0;
    if (p.isParametric) {
      z_susp = p.paramAmp * Math.sin(p.paramFreq * t);
    }
    
    const h = p.l * (1 - Math.cos(phi)) + z_susp;
    const potential = p.m * p.g * h;
    return kinetic + potential;
  }

  // Integrates one step using Euler-Cromer
  static stepEulerCromer(
    phi: number, 
    dphi: number, 
    t: number, 
    dt: number, 
    p: SinglePendulumParams
  ): { phi: number; dphi: number } {
    const acc = this.getAcceleration(phi, dphi, t, p);
    const dphiNew = dphi + acc * dt;
    const phiNew = phi + dphiNew * dt;
    return { phi: phiNew, dphi: dphiNew };
  }

  // Integrates one step using Velocity Verlet
  static stepVerlet(
    phi: number, 
    dphi: number, 
    t: number, 
    dt: number, 
    p: SinglePendulumParams
  ): { phi: number; dphi: number } {
    const acc = this.getAcceleration(phi, dphi, t, p);
    const phiNew = phi + dphi * dt + 0.5 * acc * dt * dt;
    
    // Estimate velocity at next step to compute next acceleration
    const dphiEst = dphi + acc * dt;
    const accNew = this.getAcceleration(phiNew, dphiEst, t + dt, p);
    
    const dphiNew = dphi + 0.5 * (acc + accNew) * dt;
    return { phi: phiNew, dphi: dphiNew };
  }

  // Integrates one step using Runge-Kutta 4
  static stepRK4(
    phi: number, 
    dphi: number, 
    t: number, 
    dt: number, 
    p: SinglePendulumParams
  ): { phi: number; dphi: number } {
    const f = (phiVal: number, dphiVal: number, tVal: number) => {
      return this.getAcceleration(phiVal, dphiVal, tVal, p);
    };

    // k1
    const k1_phi = dphi;
    const k1_dphi = f(phi, dphi, t);

    // k2
    const k2_phi = dphi + 0.5 * dt * k1_dphi;
    const k2_dphi = f(phi + 0.5 * dt * k1_phi, dphi + 0.5 * dt * k1_dphi, t + 0.5 * dt);

    // k3
    const k3_phi = dphi + 0.5 * dt * k2_dphi;
    const k3_dphi = f(phi + 0.5 * dt * k2_phi, dphi + 0.5 * dt * k2_dphi, t + 0.5 * dt);

    // k4
    const k4_phi = dphi + dt * k3_dphi;
    const k4_dphi = f(phi + dt * k3_phi, dphi + dt * k3_dphi, t + dt);

    const phiNew = phi + (dt / 6) * (k1_phi + 2 * k2_phi + 2 * k3_phi + k4_phi);
    const dphiNew = dphi + (dt / 6) * (k1_dphi + 2 * k2_dphi + 2 * k3_dphi + k4_dphi);

    return { phi: phiNew, dphi: dphiNew };
  }

  // Main integration entry point
  static step(
    phi: number, 
    dphi: number, 
    t: number, 
    dt: number, 
    p: SinglePendulumParams, 
    solver: SolverType
  ): { phi: number; dphi: number } {
    // Keep angle normalized between -PI and PI for physical realism
    const result = (() => {
      switch (solver) {
        case 'euler-cromer': return this.stepEulerCromer(phi, dphi, t, dt, p);
        case 'verlet': return this.stepVerlet(phi, dphi, t, dt, p);
        case 'rk4': return this.stepRK4(phi, dphi, t, dt, p);
      }
    })();

    // Handle wrapping around 2PI beautifully
    let wrappedPhi = result.phi;
    while (wrappedPhi > Math.PI) wrappedPhi -= 2 * Math.PI;
    while (wrappedPhi < -Math.PI) wrappedPhi += 2 * Math.PI;

    return { phi: wrappedPhi, dphi: result.dphi };
  }
}

export class FoucaultSolver {
  // Computes the 3D acceleration vector for Foucault's pendulum (Project 1.12)
  // Position r is relative to suspension point (0, 0, l)
  // r = (x, y, z-l), so the actual coordinate of the bob is (x, y, z)
  static getAcceleration3D(
    r: Vector3D, 
    v: Vector3D, 
    omega: Vector3D, 
    p: FoucaultParams
  ): Vector3D {
    // Angle of deviation
    // cos(phi) = (l - z) / l
    // Since r is relative to suspension, r.z is negative (e.g. z - l)
    const cosPhi = Math.abs(r.z) / p.l;

    // String tension force (divided by mass): N = v^2 / l + g * cos(phi)
    const vSq = v.magnitudeSq();
    const N = vSq / p.l + p.g * cosPhi;

    // Coriolis acceleration: 2 * (v x omega)
    const aCoriolis = v.cross(omega).scale(2);

    // Tension acceleration: - (N / l) * r
    const aTension = r.scale(-N / p.l);

    // Gravity acceleration: (0, 0, -g)
    const aGravity = new Vector3D(0, 0, -p.g);

    // Total acceleration
    return aCoriolis.add(aTension).add(aGravity);
  }

  // Integrates Foucault using RK4 in horizontal state [x, y, vx, vy]
  // We reconstruct z and vz from constraints
  static stepRK4(
    x: number, 
    y: number, 
    vx: number, 
    vy: number, 
    _t: number, 
    dt: number, 
    p: FoucaultParams
  ): { x: number; y: number; vx: number; vy: number; z: number; vz: number } {
    // Earth rotation vector at latitude psi:
    // We place the coordinate frame such that:
    // x is east, y is north, z is vertical
    // Earth angular velocity: omega = (0, omega_y, omega_z) = (0, omega*cos(lat), omega*sin(lat))
    const latRad = (p.latitude * Math.PI) / 180;
    const omega = new Vector3D(
      0, 
      p.omegaEarth * Math.cos(latRad), 
      p.omegaEarth * Math.sin(latRad)
    );

    // Helper to calculate full 3D state and acceleration given (x, y, vx, vy)
    const getDerivatives = (xVal: number, yVal: number, vxVal: number, vyVal: number) => {
      // Keep x, y bounded inside string sphere
      const dSq = xVal * xVal + yVal * yVal;
      let boundedX = xVal;
      let boundedY = yVal;
      if (dSq >= p.l * p.l * 0.99) {
        const factor = Math.sqrt(p.l * p.l * 0.99 / dSq);
        boundedX *= factor;
        boundedY *= factor;
      }

      // z relative to suspension point (z - l)
      const rz_rel = -Math.sqrt(p.l * p.l - (boundedX * boundedX + boundedY * boundedY));
      const zVal = p.l + rz_rel; // height from equilibrium

      // v_z from constraint x*vx + y*vy + (z-l)*vz = 0
      // vz = - (x*vx + y*vy) / (z-l)
      const vzVal = rz_rel !== 0 ? -(boundedX * vxVal + boundedY * vyVal) / rz_rel : 0;

      const rVec = new Vector3D(boundedX, boundedY, rz_rel);
      const vVec = new Vector3D(vxVal, vyVal, vzVal);

      const aVec = this.getAcceleration3D(rVec, vVec, omega, p);

      return {
        dx: vxVal,
        dy: vyVal,
        dvx: aVec.x,
        dvy: aVec.y,
        z: zVal,
        vz: vzVal
      };
    };

    // RK4 steps
    // k1
    const k1 = getDerivatives(x, y, vx, vy);

    // k2
    const k2 = getDerivatives(
      x + 0.5 * dt * k1.dx,
      y + 0.5 * dt * k1.dy,
      vx + 0.5 * dt * k1.dvx,
      vy + 0.5 * dt * k1.dvy
    );

    // k3
    const k3 = getDerivatives(
      x + 0.5 * dt * k2.dx,
      y + 0.5 * dt * k2.dy,
      vx + 0.5 * dt * k2.dvx,
      vy + 0.5 * dt * k2.dvy
    );

    // k4
    const k4 = getDerivatives(
      x + dt * k3.dx,
      y + dt * k3.dy,
      vx + dt * k3.dvx,
      vy + dt * k3.dvy
    );

    const xNew = x + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
    const yNew = y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
    const vxNew = vx + (dt / 6) * (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx);
    const vyNew = vy + (dt / 6) * (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy);

    // Final physical state
    const finalState = getDerivatives(xNew, yNew, vxNew, vyNew);

    return {
      x: xNew,
      y: yNew,
      vx: vxNew,
      vy: vyNew,
      z: finalState.z,
      vz: finalState.vz
    };
  }

  // Calculate Coriolis Force vector for display
  static getCoriolisForce(v: Vector3D, omegaEarth: number, latitude: number): Vector3D {
    const latRad = (latitude * Math.PI) / 180;
    const omega = new Vector3D(
      0, 
      omegaEarth * Math.cos(latRad), 
      omegaEarth * Math.sin(latRad)
    );
    return v.cross(omega).scale(2); // acceleration, force = m * a
  }
}
