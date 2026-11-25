// three の型の代わり（Issue #315）。video/ に足した依存は three だけで、型のパッケージ（@types/three）は足していない。
// three から取り込むものは any になる。three を使うのは sonaScene.ts だけ。
declare module "three";
