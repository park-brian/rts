import test from 'node:test';
import assert from 'node:assert/strict';
import * as SimApi from '../src/index.ts';

const PRIVATE_MECHANIC_EXPORTS = [
  'applyTransform',
  'canBurrowSlot',
  'canPlayerGatherTarget',
  'canUseWeaponNow',
  'clearBuildCost',
  'completeInternalProduct',
  'consumeInternalProduct',
  'consumeReadyNuke',
  'coveredByEffect',
  'effectiveSpeed',
  'hasPendingBuild',
  'isDisabled',
  'isGatherTarget',
  'launchScarab',
  'loadUnitInto',
  'pickPatch',
  'repairCost',
  'resourceDockingPoint',
  'queueResearch',
  'startStructureLanding',
  'startAddon',
  'storeInternalProduct',
  'transferBuildCost',
  'unloadUnit',
] as const;

const PUBLIC_ENGINE_EXPORTS = [
  'Ability',
  'COMMAND_HEADS',
  'CREEP_RADIUS',
  'Kind',
  'LOAD_RANGE',
  'POWER_RADIUS',
  'Sim',
  'Tech',
  'Units',
  'UNLOAD_RANGE',
  'actorRenderPresentation',
  'activeAddonParentSlot',
  'addonParentKind',
  'canDetect',
  'canPlaceStructure',
  'createObservationBuffers',
  'entityLifeBar',
  'generateMap',
  'getTechLevel',
  'hashState',
  'internalProductDef',
  'isBaseDepotKind',
  'isLiftedStructureFlags',
  'setTechLevel',
  'stepWorld',
  'validateCommand',
] as const;

test('public sim barrel keeps tick mechanics private', () => {
  for (const name of PRIVATE_MECHANIC_EXPORTS) {
    assert.equal(name in SimApi, false, `${name} should stay behind its mechanic owner`);
  }
});

test('public sim barrel keeps intentional app ai and headless affordances', () => {
  for (const name of PUBLIC_ENGINE_EXPORTS) {
    assert.equal(name in SimApi, true, `${name} should remain available through @rts/sim`);
  }
});
