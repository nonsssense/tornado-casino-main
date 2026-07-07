/**
 * Formatting helpers.
 *
 * Responsibility:
 * - Currency, number, and display formatting.
 * - Legacy app.js has money() inline — migrate here when refactoring.
 */

export function formatCurrency(value, currency = 'USD') {
  // TODO: replace legacy money() helper during migration
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(num);
}
