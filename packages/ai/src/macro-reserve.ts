export type CombatReserve = {
  units: readonly number[];
  commitmentForce: number;
  defenseActive: boolean;
};

export const combatReserve = (
  units: readonly number[],
  commitmentForce: number = units.length,
  defenseActive = false,
): CombatReserve => ({
  units,
  commitmentForce,
  defenseActive,
});
