// Actions Svelte qui peignent des icônes de jeu dans un <canvas>.
import { MAPS } from '../game/data';
import { paintBubbleIcon, paintTowerIcon } from '../game/render';
import { ctx2d } from '../game/assets';

export function towerIcon(node: HTMLCanvasElement, type: string) {
  paintTowerIcon(node, type);
  return { update: (t: string) => paintTowerIcon(node, t) };
}
export interface BubbleIconArg { t: string; camo?: boolean; rg?: boolean }
export function bubbleIcon(node: HTMLCanvasElement, a: BubbleIconArg) {
  paintBubbleIcon(node, a.t, a.camo, a.rg);
  return { update: (b: BubbleIconArg) => paintBubbleIcon(node, b.t, b.camo, b.rg) };
}
export function mapThumb(node: HTMLCanvasElement, i: number) {
  const draw = (k: number) => { const th = MAPS[k].thumb; if (th) ctx2d(node).drawImage(th, 0, 0, node.width, node.height); };
  draw(i);
  return { update: draw };
}
