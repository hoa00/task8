export const securityBillingSections = ['password', 'sessions', '2fa', 'plan', 'payment', 'invoices'] as const;
export type SecurityBillingSection = typeof securityBillingSections[number];
