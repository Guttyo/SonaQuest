import {
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  RedFormat,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { paletteFor, type PuppetPalette } from "./palette";
import { blendPose, poseAt, type Pose } from "./pose";
import type { ListenerActivity } from "./types";

/**
 * 聞き取り係の 3D パペット（ADR-0032）。球・円柱・カプセルなどを組み合わせてコードで組む。
 * 外部のモデルファイル・画像・素材は使わない。three を import するのはこのファイルだけで、
 * 3D を表示するときだけ動的に読み込む（loader.ts）。
 */

export interface PuppetHandle {
  update(activity: ListenerActivity, relief: boolean): void;
  /** 描画を止めて、描画の領域を画面から外す。片づけはこの後に行う */
  detach(): void;
}

/** 1秒に30回までにする（スマートフォンの電池と熱のため） */
const FRAME_INTERVAL_MS = 1000 / 30 - 1;
/** 質問が変わって聞き取り係が作り直されるとき、同じ描画の文脈を使い回す猶予 */
const KEEP_MS = 2000;

type PartName = "body" | "accent" | "cheek" | "mouth" | "eye" | "highlight";

class PuppetStage {
  readonly canvas: HTMLCanvasElement;
  lost = false;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 50);
  private readonly gradient: DataTexture;
  private readonly materials: Record<PartName, MeshToonMaterial>;
  private readonly geometries: BufferGeometry[] = [];
  private readonly root = new Group();
  private readonly head = new Group();
  private readonly upperJaw = new Group();
  private readonly lowerJaw = new Group();
  private readonly eyes: Group[] = [];
  private readonly pupils: Mesh[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private onLost: (() => void) | null = null;
  private activity: ListenerActivity = "idle";
  private pose: Pose = poseAt("idle", 0);
  private lastFrame = -Infinity;
  private palette: PuppetPalette | null = null;

  constructor() {
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    this.renderer = new WebGLRenderer({
      // 小さな画面なので、画素の密度が低いときだけ縁を滑らかにする
      antialias: dpr < 2,
      alpha: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "puppet3d-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);

    // 平らな塗り（トゥーン調）。3段階の明るさだけにして、作り込みすぎない
    this.gradient = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
    this.gradient.minFilter = NearestFilter;
    this.gradient.magFilter = NearestFilter;
    this.gradient.needsUpdate = true;

    const toon = () => new MeshToonMaterial({ gradientMap: this.gradient });
    this.materials = {
      body: toon(),
      accent: toon(),
      cheek: toon(),
      mouth: toon(),
      eye: toon(),
      highlight: toon(),
    };
    this.materials.mouth.side = DoubleSide;
    this.setPalette(paletteFor(false));

    this.buildPuppet();

    this.scene.add(new HemisphereLight(0xffffff, 0xe6dccb, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(2.5, 3.5, 4);
    this.scene.add(sun);

    // 少し上から見下ろし、口の中が見えるようにする。胴の下は舞台の縁で切れてよい
    this.camera.position.set(0, 0.6, 6.4);
    this.camera.lookAt(0, -0.42, 0);
  }

  private geometry<T extends BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mesh(geometry: BufferGeometry, part: PartName): Mesh {
    return new Mesh(this.geometry(geometry), this.materials[part]);
  }

  /** 手袋人形の形：袖のような胴、丸い頭、上下に開く口、目、短い腕 */
  private buildPuppet(): void {
    const body = this.mesh(new CylinderGeometry(0.6, 0.82, 1.4, 20), "body");
    body.position.y = -1.15;
    this.root.add(body);

    const collar = this.mesh(new TorusGeometry(0.64, 0.13, 8, 24), "accent");
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.46;
    this.root.add(collar);

    for (const side of [-1, 1]) {
      const arm = this.mesh(new CapsuleGeometry(0.14, 0.42, 4, 8), "body");
      arm.position.set(side * 0.78, -1.0, 0.12);
      arm.rotation.z = side * 0.55;
      this.root.add(arm);
    }

    // 頭。上あごを後ろの蝶番で持ち上げ、下あごを少し下げて口を開ける（手袋人形の口の動き）
    this.head.position.y = 0.05;
    this.root.add(this.head);

    this.lowerJaw.position.set(0, 0, -0.6);
    this.head.add(this.lowerJaw);
    const lower = new Group();
    lower.position.set(0, 0, 0.6);
    this.lowerJaw.add(lower);
    const chin = this.mesh(
      new SphereGeometry(0.72, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      "body",
    );
    chin.scale.y = 0.6;
    lower.add(chin);
    const lowerMouth = this.mesh(new CircleGeometry(0.7, 24), "mouth");
    lowerMouth.rotation.x = -Math.PI / 2;
    lowerMouth.position.y = 0.002;
    lower.add(lowerMouth);

    // 蝶番は頭の後ろ。上あごの形は蝶番から前へずらして置く
    this.upperJaw.position.set(0, 0, -0.62);
    this.head.add(this.upperJaw);
    const upper = new Group();
    upper.position.set(0, 0, 0.62);
    this.upperJaw.add(upper);

    const dome = this.mesh(
      new SphereGeometry(0.76, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      "body",
    );
    upper.add(dome);
    const upperMouth = this.mesh(new CircleGeometry(0.74, 24), "mouth");
    upperMouth.rotation.x = Math.PI / 2;
    upperMouth.position.y = -0.002;
    upper.add(upperMouth);

    for (const side of [-1, 1]) {
      const eye = new Group();
      eye.position.set(side * 0.27, 0.36, 0.6);
      upper.add(eye);
      const pupil = this.mesh(new SphereGeometry(0.1, 12, 8), "eye");
      pupil.scale.set(1, 1.3, 0.6);
      eye.add(pupil);
      const shine = this.mesh(new SphereGeometry(0.03, 8, 6), "highlight");
      shine.position.set(0.03, 0.05, 0.06);
      pupil.add(shine);
      this.eyes.push(eye);
      this.pupils.push(pupil);

      const cheek = this.mesh(new SphereGeometry(0.12, 12, 8), "cheek");
      cheek.scale.set(1.2, 0.7, 0.4);
      cheek.position.set(side * 0.47, 0.14, 0.55);
      upper.add(cheek);
    }

    // 頭の上の小さな房（係を見分ける目印。医療者の帽子や記号にはしない）
    const tuft = this.mesh(new CapsuleGeometry(0.09, 0.22, 4, 8), "accent");
    tuft.position.set(0.08, 0.8, 0.02);
    tuft.rotation.z = -0.35;
    upper.add(tuft);

    this.root.position.y = 0.1;
    this.scene.add(this.root);
  }

  private setPalette(palette: PuppetPalette): void {
    if (this.palette === palette) return;
    this.palette = palette;
    for (const part of Object.keys(this.materials) as PartName[]) {
      this.materials[part].color.set(palette[part]);
    }
  }

  setState(activity: ListenerActivity, relief: boolean): void {
    this.activity = activity;
    this.setPalette(paletteFor(relief));
  }

  mount(host: HTMLElement, onLost: () => void): void {
    this.onLost = onLost;
    host.appendChild(this.canvas);
    this.resize(host);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize(host));
      this.resizeObserver.observe(host);
    }
    this.lastFrame = -Infinity;
    this.renderer.setAnimationLoop(this.frame);
    // 最初の1枚は待たずに描く（質問が変わるたびに 2D の姿が一瞬見えないように）
    this.frame(performance.now());
  }

  unmount(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.onLost = null;
    this.canvas.remove();
  }

  dispose(): void {
    this.unmount();
    // 自分で文脈を手放すときは、「失われた」の知らせとして扱わない
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    for (const g of this.geometries) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.gradient.dispose();
    this.renderer.dispose();
    // すでに失われた文脈は手放せない（three が警告を出す）
    if (!this.lost) this.renderer.forceContextLoss();
  }

  private resize(host: HTMLElement): void {
    const width = Math.max(1, Math.round(host.clientWidth));
    const height = Math.max(1, Math.round(host.clientHeight));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.renderer.setAnimationLoop(null);
    this.onLost?.();
  };

  private readonly frame = (now: number) => {
    if (now - this.lastFrame < FRAME_INTERVAL_MS) return;
    const dt = this.lastFrame === -Infinity ? 1 : Math.min((now - this.lastFrame) / 1000, 0.25);
    this.lastFrame = now;
    const t = now / 1000;
    this.pose = blendPose(this.pose, poseAt(this.activity, t), dt);
    this.applyPose(this.pose);
    this.renderer.render(this.scene, this.camera);
  };

  private applyPose(pose: Pose): void {
    this.root.rotation.z = pose.sway;
    this.root.position.y = 0.1 + pose.bob;
    this.head.rotation.z = pose.headTilt;
    this.head.rotation.x = pose.headNod;
    this.upperJaw.rotation.x = -pose.mouth * 0.75;
    this.lowerJaw.rotation.x = pose.mouth * 0.35;
    for (const eye of this.eyes) eye.scale.y = pose.eyeOpen;
    for (const pupil of this.pupils) pupil.position.y = 0.05 * pose.lookUp;
  }
}

let shared: PuppetStage | null = null;
let sharedInUse = false;
let disposeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * パペットを host の中に出す。聞き取り係は質問ごとに作り直されるので、描画の文脈は1つを使い回す。
 * 2つ同時に出すときだけ、2つめを別に作り、外したらすぐに片づける。
 * 外したもの（中断の画面に移ったときなど）は、すぐに描画を止め、KEEP_MS の後に片づける。
 */
export function attachPuppet(
  host: HTMLElement,
  options: { activity: ListenerActivity; relief: boolean; onLost: () => void },
): PuppetHandle {
  let stage: PuppetStage;
  let isShared: boolean;
  if (!sharedInUse) {
    if (disposeTimer !== null) {
      clearTimeout(disposeTimer);
      disposeTimer = null;
    }
    if (shared !== null && shared.lost) {
      shared.dispose();
      shared = null;
    }
    shared ??= new PuppetStage();
    stage = shared;
    sharedInUse = true;
    isShared = true;
  } else {
    stage = new PuppetStage();
    isShared = false;
  }
  stage.setState(options.activity, options.relief);
  stage.mount(host, options.onLost);

  let detached = false;
  return {
    update(activity, relief) {
      if (!detached) stage.setState(activity, relief);
    },
    detach() {
      if (detached) return;
      detached = true;
      if (!isShared) {
        stage.dispose();
        return;
      }
      stage.unmount();
      sharedInUse = false;
      disposeTimer = setTimeout(() => {
        disposeTimer = null;
        if (!sharedInUse && shared !== null) {
          shared.dispose();
          shared = null;
        }
      }, KEEP_MS);
    },
  };
}

/** 見本のページ用：片づけまで済んだか（描画の文脈を持っていないか） */
export function puppetStageAlive(): boolean {
  return shared !== null;
}
