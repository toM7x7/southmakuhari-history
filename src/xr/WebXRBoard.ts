import * as THREE from 'three';

export type XRMode = 'immersive-ar' | 'immersive-vr';

export type BoardTextureLoader = () => Promise<THREE.Texture>;

export interface WebXRBoardOptions {
  parent: HTMLElement;
}

export class WebXRBoard {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private board: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private lights: THREE.Light[] = [];
  private grid: THREE.GridHelper;
  private currentSession: XRSession | null = null;
  private currentTexture: THREE.Texture | null = null;
  private pendingTextureLoader: BoardTextureLoader | null = null;

  constructor({ parent }: WebXRBoardOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.domElement.style.display = 'none';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    const boardGeometry = new THREE.PlaneGeometry(2, 2);
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    this.board = new THREE.Mesh(boardGeometry, boardMaterial);
    this.board.rotateX(-Math.PI / 2);
    this.board.position.set(0, 0, -1.5);
    this.scene.add(this.board);

    const ambient = new THREE.HemisphereLight(0xe0f2fe, 0x082f49, 0.95);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(1.5, 2.2, 1.0);
    this.scene.add(ambient);
    this.scene.add(key);
    this.lights.push(ambient, key);

    this.grid = new THREE.GridHelper(4, 12, 0x334155, 0x1f2937);
    this.grid.position.y = -0.01;
    this.scene.add(this.grid);

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  async detectSupportedModes(): Promise<XRMode[]> {
    const xrSystem = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xrSystem) return [];

    const [arSupported, vrSupported] = await Promise.all([
      xrSystem.isSessionSupported('immersive-ar').catch(() => false),
      xrSystem.isSessionSupported('immersive-vr').catch(() => false),
    ]);

    const modes: XRMode[] = [];
    if (arSupported) modes.push('immersive-ar');
    if (vrSupported) modes.push('immersive-vr');
    return modes;
  }

  queueTextureLoader(loader: BoardTextureLoader) {
    this.pendingTextureLoader = loader;
  }

  async refreshTexture() {
    if (!this.pendingTextureLoader) return;
    const loader = this.pendingTextureLoader;
    this.pendingTextureLoader = null;
    try {
      const texture = await loader();
      this.applyTexture(texture);
    } catch (error) {
      console.warn('テクスチャの読み込みに失敗しました', error);
    }
  }

  async enter(mode: XRMode) {
    const xrSystem = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xrSystem) {
      throw new Error('WebXRをサポートしていない環境です');
    }

    if (this.currentSession) {
      await this.currentSession.end();
    }

    const sessionInit: XRSessionInit = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking'],
    };

    const session = await xrSystem.requestSession(mode, sessionInit);
    this.currentSession = session;
    await this.renderer.xr.setSession(session);
    this.renderer.domElement.style.display = 'block';

    session.addEventListener('end', () => {
      this.renderer.setAnimationLoop(null);
      this.renderer.domElement.style.display = 'none';
      this.currentSession = null;
    });

    if (mode === 'immersive-ar') {
      this.grid.visible = false;
      this.board.position.set(0, -0.02, -1.25);
    } else {
      this.grid.visible = true;
      this.board.position.set(0, 0, -1.5);
    }

    await this.refreshTexture();

    const clock = new THREE.Clock();
    const renderLoop = () => {
      this.board.material.opacity = 0.92 + Math.sin(clock.elapsedTime * 0.6) * 0.03;
      this.board.material.needsUpdate = true;
      const camera = this.renderer.xr.getCamera();
      this.renderer.render(this.scene, camera as THREE.Camera);
    };

    this.renderer.setAnimationLoop(renderLoop);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.setAnimationLoop(null);
    if (this.currentSession) {
      this.currentSession.end().catch(() => undefined);
      this.currentSession = null;
    }
    this.scene.remove(this.board);
    this.board.geometry.dispose();
    this.board.material.dispose();
    if (this.currentTexture) {
      this.currentTexture.dispose();
    }
    this.lights.forEach((light) => {
      this.scene.remove(light);
    });
    this.scene.remove(this.grid);
    this.grid.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }

  private applyTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    if (this.currentTexture) {
      this.currentTexture.dispose();
    }
    this.currentTexture = texture;
    this.board.material.map = texture;
    this.board.material.color.setHex(0xffffff);
    this.board.material.needsUpdate = true;
  }

  private handleResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}
