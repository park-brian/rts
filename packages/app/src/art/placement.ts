import { ONE, Role, TILE, Units } from '../sim.ts';
import { SPRITES } from './sprites.ts';
export { selectionBase, type SelectionBase } from '../sim.ts';

const SOURCE_SIZE = 64;
const SOURCE_CENTER = SOURCE_SIZE / 2;

export type SpritePlacement = {
  sprite: string;
  role: 'building-footprint' | 'unit-radius';
  width: number;
  height: number;
  visibleWidth: number;
  visibleHeight: number;
  offsetX: number;
  offsetY: number;
  baseOffsetX: number;
  baseOffsetY: number;
  radius: number;
  scale: number;
  footprintW: number;
  footprintH: number;
};

const cache = new Map<string, SpritePlacement>();

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const pair = (v: unknown, fallback: [number, number]): [number, number] =>
  Array.isArray(v) ? [num(v[0], fallback[0]), num(v[1], fallback[1])] : fallback;

const box = (v: unknown): [number, number, number, number] =>
  Array.isArray(v)
    ? [num(v[0], 0), num(v[1], 0), Math.max(1, num(v[2], SOURCE_SIZE)), Math.max(1, num(v[3], SOURCE_SIZE))]
    : [0, 0, SOURCE_SIZE, SOURCE_SIZE];

const stampedFootprintCenterOffset = (tiles: number): number => (tiles % 2 === 0 ? -TILE / 2 : 0);

const radialFit = (x: number, y: number, w: number, h: number, cx: number, cy: number): number => {
  const x0 = x - cx;
  const x1 = x + w - cx;
  const y0 = y - cy;
  const y1 = y + h - cy;
  return Math.max(
    Math.hypot(x0, y0),
    Math.hypot(x1, y0),
    Math.hypot(x0, y1),
    Math.hypot(x1, y1),
    1,
  );
};

export const spritePlacement = (kind: number, artKind = kind): SpritePlacement => {
  const key = `${kind}:${artKind}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const def = Units[kind]!;
  const sprite = Units[artKind]?.sprite ?? def.sprite;
  const art = SPRITES[sprite];
  const meta = art?.meta;
  const [anchorX, anchorY] = pair(meta?.anchor, [SOURCE_CENTER, SOURCE_CENTER]);
  const [visibleBoxX, visibleBoxY, visibleBoxW, visibleBoxH] = box(meta?.visibleBox);
  const isStructureArt = meta?.scaleRole === 'building-footprint' || (def.roles & Role.Structure) !== 0;
  const footprint = pair(meta?.footprint, [def.footprintW, def.footprintH]);
  const footprintW = isStructureArt ? Math.max(1, footprint[0]) : Math.max(1, def.footprintW);
  const footprintH = isStructureArt ? Math.max(1, footprint[1]) : Math.max(1, def.footprintH);
  const targetRadius = (def.radius / ONE) * (art?.scale ?? 1);
  const targetW = isStructureArt ? footprintW * TILE : targetRadius * 2;
  const targetH = isStructureArt ? footprintH * TILE : targetW;
  const sourceFitRadius = !isStructureArt
    ? radialFit(visibleBoxX, visibleBoxY, visibleBoxW, visibleBoxH, anchorX, anchorY)
    : Math.max(visibleBoxW, visibleBoxH) / 2;
  const scale = isStructureArt
    ? Math.min(targetW / visibleBoxW, targetH / visibleBoxH)
    : (targetW / 2) / sourceFitRadius;
  const width = SOURCE_SIZE * scale;
  const height = SOURCE_SIZE * scale;
  const visibleWidth = visibleBoxW * scale;
  const visibleHeight = visibleBoxH * scale;
  const fitCenterX = isStructureArt ? visibleBoxX + visibleBoxW / 2 : anchorX;
  const fitCenterY = isStructureArt ? visibleBoxY + visibleBoxH / 2 : anchorY;
  const baseOffsetX = isStructureArt ? stampedFootprintCenterOffset(footprintW) : 0;
  const baseOffsetY = isStructureArt ? stampedFootprintCenterOffset(footprintH) : 0;
  const placement: SpritePlacement = {
    sprite,
    role: isStructureArt ? 'building-footprint' : 'unit-radius',
    width,
    height,
    visibleWidth,
    visibleHeight,
    offsetX: baseOffsetX + (SOURCE_CENTER - fitCenterX) * scale,
    offsetY: baseOffsetY + (SOURCE_CENTER - fitCenterY) * scale,
    baseOffsetX,
    baseOffsetY,
    radius: isStructureArt ? Math.max(visibleWidth, visibleHeight) / 2 : targetRadius,
    scale,
    footprintW,
    footprintH,
  };
  cache.set(key, placement);
  return placement;
};

export const visualRadius = (kind: number): number => spritePlacement(kind).radius;
