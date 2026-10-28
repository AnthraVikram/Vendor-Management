export function stampCreate(actorId: string): { createdById: string; updatedById: string } {
  return { createdById: actorId, updatedById: actorId };
}

export function stampUpdate(actorId: string): { updatedById: string } {
  return { updatedById: actorId };
}
