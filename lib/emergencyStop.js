"use strict";

/**
 * Turns the `description` of /api/system/emergencyStop into a list of reason
 * codes, e.g. `["wheel", "cpuTooHot"]`. An empty list means no emergency stop.
 *
 * The spec documents `"none"`, while firmware 6.8 returns a JSON encoded array
 * as a string (`"[\"wheel\"]"`). Plain and comma separated strings are accepted
 * as well, in case other firmware versions report it differently.
 */
function parseEmergencyReasons(description) {
  let value = description;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.split(",");
    }
  }
  const list = Array.isArray(value) ? value : [value];
  const reasons = list
    .filter((reason) => typeof reason === "string")
    .map((reason) => reason.trim())
    .filter((reason) => reason && reason.toLowerCase() !== "none");
  return [...new Set(reasons)];
}

function sameReasons(a, b) {
  return a.length === b.length && a.every((reason) => b.includes(reason));
}

module.exports = { parseEmergencyReasons, sameReasons };
