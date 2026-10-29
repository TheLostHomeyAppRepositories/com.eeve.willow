"use strict";

const RETURNING_DOCKING_STATES = new Set([
  "StartDocking",
  "FindPositionInMap",
  "GotoChargingStationProximity",
  "GotoRetryPosition",
  "PositionInFrontOfChargingStation",
  "ConnectToCharger",
  "ExitAndRetry",
  "GeneralRetry",
]);
const CHARGING_DOCKING_STATES = new Set(["AutoCharging", "ManualCharging"]);
const DOCKED_DOCKING_STATES = new Set(["AutoDocked", "ManualDocked"]);
const CHARGING_STATUSES = new Set(["Constant current", "Constant voltage"]);

/** States in which the robot is moving around and should be polled more often. */
const ACTIVE_STATES = new Set(["mowing", "returning", "manual", "mapping"]);

/**
 * Collapses the robot's activity, docking and emergency information into one
 * of the `mower_state` capability values.
 */
function deriveMowerState({ inEmergency, activities, docking }) {
  const userActivity = activities?.userActivity || "";
  const scheduledActivity = activities?.scheduledActivity || "";
  const dockingState = docking?.dockingState;

  if (inEmergency) return "emergency";
  if (RETURNING_DOCKING_STATES.has(dockingState)) return "returning";
  if (userActivity === "manualdriving") return "manual";
  if (
    userActivity === "MowActivity" ||
    scheduledActivity === "MowingPlannerActivity"
  ) {
    return "mowing";
  }
  if (
    userActivity.includes("Mapping") ||
    scheduledActivity.includes("Mapping")
  ) {
    return "mapping";
  }
  if (
    CHARGING_DOCKING_STATES.has(dockingState) ||
    DOCKED_DOCKING_STATES.has(dockingState)
  ) {
    // The robot stays in "ManualCharging"/"AutoCharging" once full, with the charger suspended.
    const charging =
      docking.chargingPower > 0 ||
      docking.chargingCurrent > 0 ||
      CHARGING_STATUSES.has(docking.chargeStatus);
    return charging ? "charging" : "docked";
  }
  return "idle";
}

module.exports = { deriveMowerState, ACTIVE_STATES };
