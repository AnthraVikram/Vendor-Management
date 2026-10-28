export function leavesNoActiveAdministrator(input: {
  activeAdministratorCount: number;
  targetIsActiveAdministrator: boolean;
  willBeActiveAdministrator: boolean;
}): boolean {
  let next = input.activeAdministratorCount;
  if (input.targetIsActiveAdministrator) next -= 1;
  if (input.willBeActiveAdministrator) next += 1;
  return next < 1;
}
