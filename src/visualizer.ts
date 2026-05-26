import * as THREE from 'three';
import { Vector3D } from './physics';

export class PendulumVisualizer {
  private container: HTMLDivElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  
  // 3D Objects
  private ceiling!: THREE.Mesh;
  private bob!: THREE.Mesh;
  private stringLine!: THREE.Line;
  private trail!: THREE.Line;
  private floorGrid!: THREE.Group;
  
  // Dynamic Trail
  private trailPoints: THREE.Vector3[] = [];
  private maxTrailPoints = 2000;
  
  // Vectors (THREE.ArrowHelper)
  private gravityArrow!: THREE.ArrowHelper;
  private tensionArrow!: THREE.ArrowHelper;
  private coriolisArrow!: THREE.ArrowHelper;
  
  // Orbital Camera state
  private cameraRadius = 6;
  private cameraTheta = Math.PI / 4; // horizontal rotation
  private cameraPhi = Math.PI / 3;   // vertical rotation
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  
  // Settings
  private showVectors = true;
  private showTrail = true;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.initScene();
    this.initLights();
    this.initObjects();
    this.initCameraControls();
    this.animate();
    
    // Resize Listener
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private initScene() {
    this.scene = new THREE.Scene();
    
    // Premium dark cosmic background tinting toward brand color
    this.scene.background = new THREE.Color(0x0a0c10); 
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.08);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.container.appendChild(this.renderer.domElement);
  }

  private initLights() {
    // Soft environmental ambient light
    const ambientLight = new THREE.AmbientLight(0x1a2233, 0.6);
    this.scene.add(ambientLight);

    // Directional light casting shadows
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.bias = -0.001;
    this.scene.add(dirLight);

    // Dynamic blue neon spot light pointing at the pendulum core
    const spotLight = new THREE.SpotLight(0x00d2ff, 4, 15, Math.PI / 6, 0.5, 1);
    spotLight.position.set(0, 5, 0);
    spotLight.castShadow = true;
    this.scene.add(spotLight);
  }

  private initObjects() {
    // 1. Suspension ceiling mount (Page 44)
    const ceilingGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32);
    const ceilingMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff, 
      metalness: 0.1, 
      roughness: 0.8,
      emissive: 0x111111
    });
    this.ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    this.ceiling.position.y = 2.5; // suspension point at y = 2.5
    this.ceiling.receiveShadow = true;
    this.scene.add(this.ceiling);

    // 2. The bob - polished metallic chrome sphere
    const bobGeo = new THREE.SphereGeometry(0.2, 32, 32);
    const bobMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc, // Beautiful bright cyan
      metalness: 0.95,
      roughness: 0.05,
      emissive: 0x003322, // subtle glow
    });
    this.bob = new THREE.Mesh(bobGeo, bobMat);
    this.bob.castShadow = true;
    this.bob.receiveShadow = true;
    this.scene.add(this.bob);

    // 3. String / Rod line
    const lineMat = new THREE.LineBasicMaterial({ 
      color: 0x667788,
      transparent: true,
      opacity: 0.6
    });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 2.5, 0),
      new THREE.Vector3(0, 0, 0)
    ]);
    this.stringLine = new THREE.Line(lineGeo, lineMat);
    this.scene.add(this.stringLine);

    // 4. Trajectory Trail ribbon (glowing cyan line)
    const trailMat = new THREE.LineBasicMaterial({ 
      color: 0x00d2ff, 
      transparent: true, 
      opacity: 0.8 
    });
    const trailGeo = new THREE.BufferGeometry();
    this.trail = new THREE.Line(trailGeo, trailMat);
    this.scene.add(this.trail);

    // 5. Floor compass & grid (Page 44 circular polar grid)
    this.floorGrid = new THREE.Group();
    this.floorGrid.position.y = -2.0; // Floor placed below lowest bob height
    
    // Concentric grid circles
    for (let r = 0.5; r <= 3.0; r += 0.5) {
      const circGeo = new THREE.RingGeometry(r - 0.005, r + 0.005, 64);
      const isOutermost = Math.abs(r - 3.0) < 0.01;
      const isPrimary = Math.abs(r - 1.5) < 0.01;
      
      const color = isOutermost ? 0x00ffff : (isPrimary ? 0x3388ff : 0x1e2d40);
      const circMat = new THREE.MeshBasicMaterial({ 
        color: color, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isOutermost ? 0.6 : 0.3
      });
      const circ = new THREE.Mesh(circGeo, circMat);
      circ.rotation.x = Math.PI / 2;
      this.floorGrid.add(circ);
    }

    // Compass dial degree lines (every 15 degrees)
    for (let deg = 0; deg < 180; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const x = 3.0 * Math.sin(rad);
      const z = 3.0 * Math.cos(rad);
      
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-x, 0, -z),
        new THREE.Vector3(x, 0, z)
      ]);
      const lineMat = new THREE.LineBasicMaterial({ 
        color: deg % 45 === 0 ? 0x3388ff : 0x141f2d,
        transparent: true,
        opacity: deg % 45 === 0 ? 0.4 : 0.2
      });
      const line = new THREE.Line(lineGeo, lineMat);
      this.floorGrid.add(line);
    }
    this.scene.add(this.floorGrid);

    // 6. Vector helpers for force visualization
    // Gravity: Green arrow down
    this.gravityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 0),
      0.8,
      0x39ff14, // neon green
      0.15,
      0.08
    );
    // Tension: Blue arrow along the string
    this.tensionArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      0.8,
      0x00d2ff, // neon blue
      0.15,
      0.08
    );
    // Coriolis Force: Red arrow
    this.coriolisArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      0.8,
      0xff3366, // neon red
      0.15,
      0.08
    );

    this.scene.add(this.gravityArrow);
    this.scene.add(this.tensionArrow);
    this.scene.add(this.coriolisArrow);
  }

  // Camera Orbit logic
  private initCameraControls() {
    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.previousMousePosition.x;
      const deltaY = e.clientY - this.previousMousePosition.y;

      this.cameraTheta -= deltaX * 0.005;
      this.cameraPhi -= deltaY * 0.005;

      // Restrict phi to avoid flipping camera over the top/bottom poles
      this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi));

      this.updateCameraPosition();
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.cameraRadius += e.deltaY * 0.005;
      this.cameraRadius = Math.max(2.0, Math.min(15.0, this.cameraRadius));
      this.updateCameraPosition();
    };

    // Attach to visualizer container
    const dom = this.container;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
  }

  private updateCameraPosition() {
    this.camera.position.x = this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
    this.camera.position.y = this.cameraRadius * Math.cos(this.cameraPhi) + 0.5; // shift up slightly
    this.camera.position.z = this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    this.camera.lookAt(0, 0.5, 0); // look at center height
  }

  private onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // Updates the 3D visual position of the bob and forces
  // bobPos: position coordinates, where the suspension point is at (0, 2.5, 0)
  public updateState(
    bobPos3D: Vector3D, 
    tensionForceVec: Vector3D, 
    coriolisForceVec: Vector3D,
    suspensionOffsetZ: number = 0
  ) {
    // 1. Position ceiling support (in parametric mode, it moves vertically)
    const suspY = 2.5 + suspensionOffsetZ;
    this.ceiling.position.y = suspY;

    // 2. Position the bob sphere
    // Shift physics coordinates such that physical equilibrium (0,0,0) fits 3D world (0, 2.5 - l, 0)
    // Physical coordinate r represents vector relative to suspension.
    // So visual position of bob is (r.x, suspY + r.z, r.y) -> mapped to 3D coords
    const visualX = bobPos3D.x;
    const visualY = suspY + bobPos3D.z; // bobPos3D.z is negative (z - l)
    const visualZ = bobPos3D.y;         // map physical Y to 3D Z for beautiful display
    
    this.bob.position.set(visualX, visualY, visualZ);

    // 3. Update string line geometry
    const stringPoints = [
      new THREE.Vector3(0, suspY, 0),
      new THREE.Vector3(visualX, visualY, visualZ)
    ];
    this.stringLine.geometry.setFromPoints(stringPoints);

    // 4. Update trailing ribbon
    if (this.showTrail) {
      this.trailPoints.push(new THREE.Vector3(visualX, visualY, visualZ));
      if (this.trailPoints.length > this.maxTrailPoints) {
        this.trailPoints.shift();
      }
      this.trail.geometry.setFromPoints(this.trailPoints);
      this.trail.visible = true;
    } else {
      this.trail.visible = false;
    }

    // 5. Update force vector arrows
    if (this.showVectors) {
      this.gravityArrow.visible = true;
      this.tensionArrow.visible = true;
      
      // Position arrows at the center of the bob
      const bobPos = new THREE.Vector3(visualX, visualY, visualZ);
      this.gravityArrow.position.copy(bobPos);
      this.tensionArrow.position.copy(bobPos);
      this.coriolisArrow.position.copy(bobPos);

      // Gravity force vector (scaled down for visual clarity, direction is 0, -1, 0 in physics)
      // Gravity acts purely downward: F_g = -m*g
      const gDir = new THREE.Vector3(0, -1, 0);
      this.gravityArrow.setDirection(gDir);
      this.gravityArrow.setLength(0.6, 0.15, 0.08);

      // Tension force vector (pointed along the string from bob to suspension)
      const tVec = new THREE.Vector3(0, suspY, 0).sub(bobPos);
      const tLen = tVec.length();
      if (tLen > 0.01) {
        const tDir = tVec.clone().normalize();
        this.tensionArrow.setDirection(tDir);
        
        // Scale Arrow length proportional to tension magnitude
        const tensionMag = tensionForceVec.magnitude();
        // Base length proportional to magnitude, capped to prevent screen stretching
        const arrowLen = Math.min(2.5, 0.3 + tensionMag * 0.05); 
        this.tensionArrow.setLength(arrowLen, 0.15, 0.08);
      }

      // Coriolis Force vector (only visible in Foucault mode)
      const coriolisMag = coriolisForceVec.magnitude();
      if (coriolisMag > 1e-8) {
        this.coriolisArrow.visible = true;
        // Map coriolis vector: physical (x, y, z) to 3D (x, z, y)
        const cDir = new THREE.Vector3(
          coriolisForceVec.x,
          coriolisForceVec.z,
          coriolisForceVec.y
        ).normalize();
        
        this.coriolisArrow.setDirection(cDir);
        const arrowLen = Math.min(2.5, 0.2 + coriolisMag * 10); // scale up Coriolis since it is small
        this.coriolisArrow.setLength(arrowLen, 0.15, 0.08);
      } else {
        this.coriolisArrow.visible = false;
      }
    } else {
      this.gravityArrow.visible = false;
      this.tensionArrow.visible = false;
      this.coriolisArrow.visible = false;
    }
  }

  // Clears the trailing ribbon
  public clearTrail() {
    this.trailPoints = [];
    this.trail.geometry.setFromPoints([]);
  }

  // Toggle Vector visibility
  public toggleVectors(show: boolean) {
    this.showVectors = show;
  }

  // Toggle Trail visibility
  public toggleTrail(show: boolean) {
    this.showTrail = show;
    if (!show) this.clearTrail();
  }

  // Set maximum trail length
  public setMaxTrailLength(length: number) {
    this.maxTrailPoints = length;
    if (this.trailPoints.length > length) {
      this.trailPoints = this.trailPoints.slice(this.trailPoints.length - length);
    }
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}
