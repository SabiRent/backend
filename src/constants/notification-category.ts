// The kind of thing a notification is about. Drives the category tabs in the UI
// (Payments / Properties / Tenants / Maintenance) and the icon shown on each row.
// The "All" tab in the design is just the unfiltered view, not a category.
export enum NotificationCategory {
  // Rent received/confirmed, rent due soon, rent overdue, etc.
  PAYMENTS = 'payments',
  // A property or one of its units (property update, unit marked vacant).
  PROPERTIES = 'properties',
  // Tenant lifecycle (new tenant added to a property, tenant removed).
  TENANTS = 'tenants',
  // Maintenance requests raised against a unit.
  MAINTENANCE = 'maintenance',
}
