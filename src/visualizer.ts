import * as THREE from 'three';
import { Vector3D } from './physics';

/**
 * 3D Визуализатор физического маятника на базе WebGL (библиотека Three.js)
 * Отвечает за:
 * 1. Инициализацию 3D-сцены, камеры, рендерера и мягкого сценического освещения.
 * 2. Отрисовку 3D-объектов маятника: потолочного диска подвеса, нити, хромированного шара (bob).
 * 3. Построение круговой разметки пола (полярного компаса) для маятника Фуко.
 * 4. Ручную обработку мыши/колесика для орбитального вращения камеры вокруг центра.
 * 5. Динамическую прорисовку 3D-векторов сил в реальном времени (натяжения, тяжести, силы Кориолиса).
 * 6. Создание красивого светящегося шлейфа (Trail) траектории шарика.
 */
export class PendulumVisualizer {
  private container: HTMLDivElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  // 3D-модели элементов
  private ceiling!: THREE.Mesh;       // Диск подвеса на потолке
  private bob!: THREE.Mesh;           // Сферический хромированный груз
  private stringLine!: THREE.Line;    // Нить маятника
  private trail!: THREE.Line;         // Хвост траектории
  private floorGrid!: THREE.Group;    // Круговая разметка на полу (полярная сетка)

  // Векторы сил (разноцветные стрелочки)
  private gravityArrow!: THREE.ArrowHelper;   // Зеленая стрелка силы тяжести
  private tensionArrow!: THREE.ArrowHelper;   // Синяя стрелка натяжения нити
  private coriolisArrow!: THREE.ArrowHelper;  // Красная стрелка силы Кориолиса

  // Массив точек для рисования шлейфа траектории
  private trailPoints: THREE.Vector3[] = [];
  private maxTrailPoints = 2000;

  // Параметры орбитальной камеры
  private cameraRadius = 6;              // Расстояние от камеры до центра
  private cameraTheta = Math.PI / 4;     // Угол поворота камеры по горизонтали (азимут)
  private cameraPhi = Math.PI / 3;       // Угол наклона камеры по вертикали (зенит)
  private isDragging = false;            // Флаг зажатия левой кнопки мыши
  private previousMousePosition = { x: 0, y: 0 };

  // Переключатели отображения
  private showVectors = true;
  private showTrail = true;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.initScene();            // Создаем мир, камеру и рендерер
    this.initLights();           // Добавляем красивый свет
    this.initObjects();          // Создаем 3D модели, компас и векторы
    this.initCameraControls();   // Подключаем вращение камеры мышкой
    this.animate();              // Запускаем бесконечный цикл рендеринга
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  /**
   * Инициализирует глобальную 3D сцену. Настраивает
   * камеру перспективы и WebGL-рендерер с поддержкой мягких теней.
   */
  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10); // Темно-синий космический космос

    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true }); // Включаем сглаживание углов
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Поддержка Retina экранов
    this.renderer.shadowMap.enabled = true; // Разрешаем тени на сцене
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Мягкие, сглаженные тени
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * Настраивает сложное премиальное освещение сцены:
   * 1. Мягкий рассеянный окружающий свет (AmbientLight) с глубоким синим оттенком.
   * 2. Направленный белый прожектор (DirectionalLight) для создания четких теней.
   * 3. Синий неоновыйスポット-лайт (SpotLight), сфокусированный на центре маятника для объема.
   */
  private initLights() {
    this.scene.add(new THREE.AmbientLight(0x1a2233, 0.6));

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024); // Высокое качество карт теней
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.bias = -0.001; // Убираем артефакты самозатенения
    this.scene.add(dirLight);

    const spotLight = new THREE.SpotLight(0x00d2ff, 4, 15, Math.PI / 6, 0.5, 1);
    spotLight.position.set(0, 5, 0);
    spotLight.castShadow = true;
    this.scene.add(spotLight);
  }

  /**
   * Создает все геометрические 3D-модели на сцене.
   */
  private initObjects() {
    // 1. Потолочный диск подвеса
    this.ceiling = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.8, emissive: 0x111111 })
    );
    this.ceiling.position.y = 2.5; // Точка подвеса находится на высоте y = 2.5 м
    this.ceiling.receiveShadow = true;
    this.scene.add(this.ceiling);

    // 2. Шарик маятника (полированный зеркальный хром красивого бирюзового цвета)
    this.bob = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x00ffcc, metalness: 0.95, roughness: 0.05, emissive: 0x003322 })
    );
    this.bob.castShadow = this.bob.receiveShadow = true;
    this.scene.add(this.bob);

    // 3. Нить маятника (тонкая линия)
    this.stringLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.5, 0), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x667788, transparent: true, opacity: 0.6 })
    );
    this.scene.add(this.stringLine);

    // 4. Траекторная лента (шлейф), которая светится неоновым синим цветом
    this.trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 })
    );
    this.scene.add(this.trail);

    // 5. Круговая сетка-компас на полу (полярная сетка, стр. 44 методички)
    this.floorGrid = new THREE.Group();
    this.floorGrid.position.y = -2.0; // Размещаем пол ниже самой низкой точки маятника

    // Рисуем 6 концентрических окружностей сетки через каждые 0.5 м
    for (let r = 0.5; r <= 3.0; r += 0.5) {
      const isOut = Math.abs(r - 3.0) < 0.01, isPri = Math.abs(r - 1.5) < 0.01;
      const circ = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.005, r + 0.005, 64),
        new THREE.MeshBasicMaterial({ color: isOut ? 0x00ffff : (isPri ? 0x3388ff : 0x1e2d40), side: THREE.DoubleSide, transparent: true, opacity: isOut ? 0.6 : 0.3 })
      );
      circ.rotation.x = Math.PI / 2; // Разворачиваем кольцо горизонтально
      this.floorGrid.add(circ);
    }

    // Рисуем шкалу румбов/градусов (диагональные лучи каждые 15 градусов)
    for (let deg = 0; deg < 180; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const x = 3.0 * Math.sin(rad), z = 3.0 * Math.cos(rad);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-x, 0, -z), new THREE.Vector3(x, 0, z)]),
        new THREE.LineBasicMaterial({ color: deg % 45 === 0 ? 0x3388ff : 0x141f2d, transparent: true, opacity: deg % 45 === 0 ? 0.4 : 0.2 })
      );
      this.floorGrid.add(line);
    }
    this.scene.add(this.floorGrid);

    // 6. Стрелки-помощники для визуализации сил (ультра-компактная функция инициализации)
    const createArrow = (color: number) => new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.8, color, 0.15, 0.08);
    this.gravityArrow = createArrow(0x39ff14);   // Сила тяжести (зеленая)
    this.tensionArrow = createArrow(0x00d2ff);   // Сила натяжения (синяя)
    this.coriolisArrow = createArrow(0xff3366);  // Сила Кориолиса (красная)

    this.scene.add(this.gravityArrow, this.tensionArrow, this.coriolisArrow);
  }

  /**
   * Подключает события захвата мыши и скролла для вращения камеры вокруг маятника.
   * Реализовано через компактные стрелочные функции для экономии строк.
   */
  private initCameraControls() {
    // Нажатие кнопки мыши фиксирует старт перетаскивания
    this.container.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    // Движение мыши вращает камеру по углам Theta и Phi
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.cameraTheta -= (e.clientX - this.previousMousePosition.x) * 0.005;
      // Ограничиваем угол Phi, чтобы камера не перевернулась "вверх ногами" у полюсов
      this.cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraPhi - (e.clientY - this.previousMousePosition.y) * 0.005));
      this.updateCameraPosition();
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    // Отжатие кнопки мыши останавливает перетаскивание
    window.addEventListener('mouseup', () => this.isDragging = false);

    // Вращение колесика отдаляет/приближает камеру (изменяет радиус)
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraRadius = Math.max(2.0, Math.min(15.0, this.cameraRadius + e.deltaY * 0.005));
      this.updateCameraPosition();
    }, { passive: false });
  }

  /**
   * Переводит сферические углы камеры (Radius, Theta, Phi) в декартовы 3D координаты
   * и заставляет камеру смотреть точно на высоту маятника.
   */
  private updateCameraPosition() {
    this.camera.position.x = this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
    this.camera.position.y = this.cameraRadius * Math.cos(this.cameraPhi) + 0.5; // Смещение вверх
    this.camera.position.z = this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    this.camera.lookAt(0, 0.5, 0); // Смотрим на центр колебаний
  }

  /**
   * Обновляет пропорции камеры и рендерера при изменении размеров экрана.
   */
  private onWindowResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Главный метод обновления визуализации шарика и векторов сил.
   * Принимает физические векторы и переносит их в 3D координаты экрана.
   * @param bobPos3D Положение шарика в физических координатах
   * @param tensionForceVec Вектор силы натяжения нити
   * @param coriolisForceVec Вектор силы Кориолиса
   * @param suspensionOffsetZ Сдвиг точки подвеса по вертикали (для параметрического резонанса)
   */
  public updateState(
    bobPos3D: Vector3D,
    tensionForceVec: Vector3D,
    coriolisForceVec: Vector3D,
    suspensionOffsetZ: number = 0
  ) {
    // 1. Движение потолка подвеса вверх-вниз в режиме параметрической накачки
    const suspY = 2.5 + suspensionOffsetZ;
    this.ceiling.position.y = suspY;

    // 2. Перевод физических координат (r.x, r.y, r.z) в 3D сцену
    // Физическая ось Y отображается на графическую Z для более красивой перспективы
    const visualX = bobPos3D.x;
    const visualY = suspY + bobPos3D.z; // bobPos3D.z отрицательный (z - l)
    const visualZ = bobPos3D.y;

    this.bob.position.set(visualX, visualY, visualZ);

    // 3. Обновление линии нити (от потолка до шарика)
    this.stringLine.geometry.setFromPoints([
      new THREE.Vector3(0, suspY, 0),
      new THREE.Vector3(visualX, visualY, visualZ)
    ]);

    // 4. Добавление новой точки в шлейф траектории
    if (this.showTrail) {
      this.trailPoints.push(new THREE.Vector3(visualX, visualY, visualZ));
      if (this.trailPoints.length > this.maxTrailPoints) this.trailPoints.shift();
      this.trail.geometry.setFromPoints(this.trailPoints);
      this.trail.visible = true;
    } else {
      this.trail.visible = false;
    }

    // 5. Отрисовка стрелочек векторов сил на шарике
    if (this.showVectors) {
      this.gravityArrow.visible = this.tensionArrow.visible = true;
      const bobPos = new THREE.Vector3(visualX, visualY, visualZ);

      // Сдвигаем все стрелочки к центру тяжести шарика
      this.gravityArrow.position.copy(bobPos);
      this.tensionArrow.position.copy(bobPos);
      this.coriolisArrow.position.copy(bobPos);

      // Вектор Силы тяжести: Направлен строго вниз, длина фиксирована
      this.gravityArrow.setDirection(new THREE.Vector3(0, -1, 0));
      this.gravityArrow.setLength(0.6, 0.15, 0.08);

      // Вектор Силы натяжения нити: Направлен вдоль нити от шарика к потолку
      const tVec = new THREE.Vector3(0, suspY, 0).sub(bobPos);
      if (tVec.length() > 0.01) {
        this.tensionArrow.setDirection(tVec.clone().normalize());
        // Длина стрелки пропорциональна реальной физической силе натяжения
        const arrowLen = Math.min(2.5, 0.3 + tensionForceVec.magnitude() * 0.05);
        this.tensionArrow.setLength(arrowLen, 0.15, 0.08);
      }

      // Вектор Силы Кориолиса (активен только для маятника Фуко)
      const coriolisMag = coriolisForceVec.magnitude();
      if (coriolisMag > 1e-8) {
        this.coriolisArrow.visible = true;
        // Переводим вектор силы Кориолиса: физический (x, y, z) в трехмерный (x, z, y)
        this.coriolisArrow.setDirection(new THREE.Vector3(coriolisForceVec.x, coriolisForceVec.z, coriolisForceVec.y).normalize());
        const arrowLen = Math.min(2.5, 0.2 + coriolisMag * 10); // Масштабируем, так как сила Кориолиса мала
        this.coriolisArrow.setLength(arrowLen, 0.15, 0.08);
      } else {
        this.coriolisArrow.visible = false;
      }
    } else {
      this.gravityArrow.visible = this.tensionArrow.visible = this.coriolisArrow.visible = false;
    }
  }

  // Очистка шлейфа траектории
  public clearTrail() {
    this.trailPoints = [];
    this.trail.geometry.setFromPoints([]);
  }

  // Переключение видимости стрелок векторов
  public toggleVectors(show: boolean) {
    this.showVectors = show;
  }

  // Переключение видимости шлейфа
  public toggleTrail(show: boolean) {
    this.showTrail = show;
    if (!show) this.clearTrail();
  }

  // Ограничение максимальной длины шлейфа
  public setMaxTrailLength(length: number) {
    this.maxTrailPoints = length;
    if (this.trailPoints.length > length) {
      this.trailPoints = this.trailPoints.slice(this.trailPoints.length - length);
    }
  }

  // Бесконечный цикл отрисовки кадров 3D-движка
  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}
