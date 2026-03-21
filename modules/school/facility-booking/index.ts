/**
 * Facility Booking Plugin Registration
 */

import { registerReservationPlugin } from "../../../src/reservation-plugins.js";

export function registerFacilityBookingPlugin() {
  registerReservationPlugin({
    id: "facility",
    name: "施設予約",
    description: "教室・会議室の予約管理",
    icon: "Building2",
    apiBasePath: "/api/school/facility-booking",
    frontendPath: "/reservations/facility",
    operations: {
      list: "/reservations",
      create: "/reservations",
      cancel: "/reservations",
    },
  });
}
