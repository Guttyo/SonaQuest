// v2 の紹介動画（Issue #315）で、ソナの 3D パペットを1コマずつ描く。
// 形・色・明かり・カメラは、アプリの web/src/puppet3d/stage.ts（ADR-0032、Issue #164・#221）から写した。
// アプリの stage.ts は描画のループ（setAnimationLoop・performance.now）と一体なので、そのまま使えない。
// 動画はコマを順不同・並列で描くので、ここでは「姿勢を渡すと1枚描く」だけにする（前のコマの状態を持ち越さない）。
// アプリの形を直したら、ここも合わせて直す。色（palette.ts）はアプリのものをそのまま使う。姿勢は sonaPose.ts（pose.ts から写したもの）。
import {
  BoxGeometry,
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
} from "three";
import { MAIN_PALETTE, type PuppetPalette } from "../../../web/src/puppet3d/palette";
import type { GesturePose, Pose } from "./sonaPose";

type PartName = keyof PuppetPalette;

/** three の物（型のパッケージを足していないので、使う所だけを書く） */
type Node3 = {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number; set(x: number, y: number, z: number): void; setScalar(v: number): void };
  visible: boolean;
  add(child: unknown): void;
};

export type SonaScene = {
  canvas: HTMLCanvasElement;
  /** 姿勢を当てて1枚描く */
  render(pose: Pose, gesture: GesturePose): void;
  dispose(): void;
};

/** size は描く正方形の1辺（ピクセル） */
export function createSonaScene(size: number): SonaScene {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    // 書き出しでは、描いた後にコマが写される。写すまで絵を残す
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  const canvas: HTMLCanvasElement = renderer.domElement;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  const disposables: Array<{ dispose(): void }> = [];

  // 平らな塗り（トゥーン調）。3段階の明るさだけ
  const gradient = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
  gradient.minFilter = NearestFilter;
  gradient.magFilter = NearestFilter;
  gradient.needsUpdate = true;
  disposables.push(gradient);

  const materials = {} as Record<PartName, { side: unknown; color: { set(c: string): void }; dispose(): void }>;
  for (const part of Object.keys(MAIN_PALETTE) as PartName[]) {
    const material = new MeshToonMaterial({ gradientMap: gradient });
    material.color.set(MAIN_PALETTE[part]);
    materials[part] = material;
    disposables.push(material);
  }
  materials.mouth.side = DoubleSide;

  const mesh = (geometry: { dispose(): void }, part: PartName): Node3 => {
    disposables.push(geometry);
    return new Mesh(geometry, materials[part]);
  };
  const group = (): Node3 => new Group();

  const root = group();
  const head = group();
  const upperJaw = group();
  const lowerJaw = group();
  const eyes: Node3[] = [];
  const pupils: Node3[] = [];
  const armPivots: Node3[] = [];
  const handbookProp = group();
  const phoneProp = group();

  // 胴・襟・おなか・腕
  const body = mesh(new CylinderGeometry(0.74, 0.9, 1.2, 20), "body");
  body.position.y = -1.08;
  root.add(body);
  const collar = mesh(new TorusGeometry(0.74, 0.11, 8, 24), "accent");
  collar.rotation.x = Math.PI / 2;
  collar.position.y = -0.46;
  root.add(collar);
  const belly = mesh(new SphereGeometry(0.46, 16, 12), "extra");
  belly.scale.set(1, 1.1, 0.36);
  belly.position.set(0, -1.12, 0.74);
  root.add(belly);
  {
    // 腕は肩を軸にした入れ物に入れ、身ぶりで持ち上げる
    const radius = 0.16, length = 0.3, x = 0.92, y = -0.96, tilt = 0.7, shoulder = 0.25;
    for (const side of [-1, 1]) {
      const angle = side * tilt;
      const dx = -Math.sin(angle) * shoulder;
      const dy = Math.cos(angle) * shoulder;
      const pivot = group();
      pivot.position.set(side * x + dx, y + dy, 0.12);
      root.add(pivot);
      const arm = mesh(new CapsuleGeometry(radius, length, 4, 8), "body");
      arm.position.set(-dx, -dy, 0);
      arm.rotation.z = angle;
      pivot.add(arm);
      armPivots.push(pivot);
    }
  }

  // 手に持つもの（箱の形だけ。文字・記号・薬の絵は入れない）
  {
    handbookProp.add(mesh(new BoxGeometry(0.62, 0.78, 0.06), "accent"));
    const label = mesh(new BoxGeometry(0.4, 0.14, 0.02), "highlight");
    label.position.set(0, 0.16, 0.04);
    handbookProp.add(label);
    handbookProp.position.set(0, -0.78, 0.95);
    handbookProp.rotation.x = -0.35;

    phoneProp.add(mesh(new BoxGeometry(0.3, 0.54, 0.05), "eye"));
    const screen = mesh(new BoxGeometry(0.24, 0.44, 0.02), "highlight");
    screen.position.set(0, 0, 0.03);
    phoneProp.add(screen);
    phoneProp.position.set(0.42, -0.62, 0.95);
    phoneProp.rotation.x = -0.4;

    for (const prop of [handbookProp, phoneProp]) {
      prop.scale.setScalar(0.001);
      prop.visible = false;
      root.add(prop);
    }
  }

  // 頭。上あごを後ろの蝶番で持ち上げ、下あごを少し下げて口を開ける
  head.position.y = 0.05;
  root.add(head);

  lowerJaw.position.set(0, 0, -0.6);
  head.add(lowerJaw);
  const lower = group();
  lower.position.set(0, 0, 0.6);
  lowerJaw.add(lower);
  const chin = mesh(new SphereGeometry(0.72, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "body");
  chin.scale.y = 0.6;
  lower.add(chin);
  const lowerMouth = mesh(new CircleGeometry(0.7, 24), "mouth");
  lowerMouth.rotation.x = -Math.PI / 2;
  lowerMouth.position.y = 0.002;
  lower.add(lowerMouth);

  upperJaw.position.set(0, 0, -0.62);
  head.add(upperJaw);
  const upper = group();
  upper.position.set(0, 0, 0.62);
  upperJaw.add(upper);
  upper.add(mesh(new SphereGeometry(0.76, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), "body"));
  const upperMouth = mesh(new CircleGeometry(0.74, 24), "mouth");
  upperMouth.rotation.x = Math.PI / 2;
  upperMouth.position.y = -0.002;
  upper.add(upperMouth);

  for (const side of [-1, 1]) {
    const eye = group();
    eye.position.set(side * 0.27, 0.36, 0.6);
    upper.add(eye);
    const pupil = mesh(new SphereGeometry(0.1, 12, 8), "eye");
    pupil.scale.set(1, 1.3, 0.6);
    eye.add(pupil);
    const shine = mesh(new SphereGeometry(0.03, 8, 6), "highlight");
    shine.position.set(0.03, 0.05, 0.06);
    pupil.add(shine);
    eyes.push(eye);
    pupils.push(pupil);

    const cheek = mesh(new SphereGeometry(0.12, 12, 8), "cheek");
    cheek.scale.set(1.2, 0.7, 0.4);
    cheek.position.set(side * 0.47, 0.14, 0.55);
    upper.add(cheek);

    // 丸い耳（内側は頬の色）
    const ear = mesh(new SphereGeometry(0.24, 14, 10), "body");
    ear.scale.set(1, 1, 0.55);
    ear.position.set(side * 0.5, 0.6, -0.05);
    upper.add(ear);
    const inner = mesh(new SphereGeometry(0.13, 12, 8), "cheek");
    inner.scale.set(1, 1, 0.4);
    inner.position.set(side * 0.5, 0.6, 0.06);
    upper.add(inner);
  }
  const muzzle = mesh(new SphereGeometry(0.24, 14, 10), "extra");
  muzzle.scale.set(1.25, 0.6, 0.6);
  muzzle.position.set(0, 0.1, 0.68);
  upper.add(muzzle);
  const nose = mesh(new SphereGeometry(0.07, 10, 8), "eye");
  nose.position.set(0, 0.2, 0.82);
  upper.add(nose);

  root.position.y = 0.1;
  scene.add(root);

  scene.add(new HemisphereLight(0xffffff, 0xe6dccb, 1.4));
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(2.5, 3.5, 4);
  scene.add(sun);

  // 少し上から見下ろし、口の中が見えるようにする。胴の下は枠の縁で切れてよい
  camera.position.set(0, 0.6, 6.4);
  camera.lookAt(0, -0.42, 0);

  const show = (prop: Node3, amount: number) => {
    prop.visible = amount > 0.02;
    prop.scale.setScalar(Math.max(0.001, amount));
  };

  return {
    canvas,
    render(pose, g) {
      root.rotation.z = pose.sway;
      root.rotation.y = g.spin;
      root.position.y = 0.1 + pose.bob;
      head.rotation.z = pose.headTilt;
      head.rotation.x = pose.headNod + g.headNod;
      head.rotation.y = pose.headTurn;
      upperJaw.rotation.x = -pose.mouth * 0.75;
      lowerJaw.rotation.x = pose.mouth * 0.35;
      for (const eye of eyes) eye.scale.y = pose.eyeOpen;
      for (const pupil of pupils) {
        pupil.position.y = 0.05 * pose.lookUp;
        pupil.position.x = 0.04 * pose.headTurn;
      }
      armPivots[0].rotation.z = -g.armLeft;
      armPivots[1].rotation.z = g.armRight;
      show(handbookProp, g.handbook);
      show(phoneProp, g.phone);
      renderer.render(scene, camera);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
