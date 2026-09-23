/* ---------------------------------------------------------------
   Default configuration.

   defaultPay() is copied verbatim from the original app.js — every
   field name and default value is unchanged, so existing saved
   org:config data keeps working. Do not rename these keys; the
   payroll engine and the Settings/Rules UI both read them by name.
----------------------------------------------------------------*/

export function defaultPay() {
  return {
    currency: "₹", basis: "monthly",
    fixedDays: 26, stdHours: 8, fullDayHours: 7, halfDayHours: 4,
    shiftStart: "09:00", lateGrace: 15, lateMarksPerDeduct: 3, lateDeductDays: 0.5,
    paidLeave: 1, otEnabled: true, otRate: 1.5, weeklyOff: [0]
  };
}

/**
 * Applied once at boot to configs saved before a given field existed,
 * so old org:config data from the original app keeps working without
 * a separate migration step. Mirrors the inline defaulting that used
 * to live in the boot handler in app.js.
 */
export function withConfigDefaults(cfg) {
  if (!cfg) return cfg;
  if (!cfg.pay) cfg.pay = defaultPay();
  if (cfg.lockOutside === undefined) cfg.lockOutside = true;
  if (cfg.adminAnywhere === undefined) cfg.adminAnywhere = true;
  if (cfg.graceMin === undefined) cfg.graceMin = 0;
  if (cfg.demo === undefined) cfg.demo = false;
  if (!Array.isArray(cfg.shifts)) cfg.shifts = [];
  return cfg;
}
