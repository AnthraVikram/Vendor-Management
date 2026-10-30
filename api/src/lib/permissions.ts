import type { StaffRole } from '@prisma/client';

// Who may record or reverse a client advance, and who may see advance amounts (FR-017, FR-025).
export const ADVANCE_RECORDERS: StaffRole[] = ['ADMINISTRATOR', 'ACCOUNTANT'];
export const ADVANCE_VIEWERS: StaffRole[] = ['ADMINISTRATOR', 'ACCOUNTANT', 'OFFICE_TEAM'];
