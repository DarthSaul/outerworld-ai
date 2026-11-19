/** The System screens, opened from the footer's System menu. */
export const SYSTEM_PATH = "/system";
export const SETTINGS_PATH = `${SYSTEM_PATH}/settings`;
export const ABILITIES_PATH = `${SYSTEM_PATH}/abilities`;

/** Where a few places link to by name (notifications, the agent page, empty states). */
export const ROUTES = {
  budgets: `${SETTINGS_PATH}/budgets`,
  discover: `${ABILITIES_PATH}/discover`,
  installed: `${ABILITIES_PATH}/installed`,
  skills: `${ABILITIES_PATH}/skills`,
} as const;
