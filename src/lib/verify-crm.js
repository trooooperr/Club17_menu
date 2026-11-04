// CRM verification script
import "./load-env";
import dbConnect, { Customer, CheckInUser, Visit, CommunicationLog } from "./db";
import { syncCustomerFromSource, triggerWelcomeAutomation } from "./crm";
import { hashPassword } from "./auth";

async function verifyCRM() {
  console.log("[Verification] Connecting to database...");
  await dbConnect();
  console.log("[Verification] Connected to database.");

  // 1. Create a mock check-in staff user if missing
  console.log("[Verification] Checking for check-in staff user...");
  let staff = await CheckInUser.findOne({ username: "verify_staff" });
  if (!staff) {
    staff = await CheckInUser.create({
      username: "verify_staff",
      email: "verify_staff@humtum.in",
      name: "Verification Bot",
      passwordHash: hashPassword("verify_password123"),
      status: "active"
    });
    console.log("[Verification] Mock check-in staff user created.");
  } else {
    console.log("[Verification] Mock check-in staff user exists.");
  }

  // 2. Clear pre-existing verification test customer if exists
  await Customer.deleteOne({ phone: "+919999999999" });
  await Customer.deleteOne({ email: "verify_test@humtum.in" });

  console.log("[Verification] Testing smart duplicate merging...");

  // 3. Register Customer first time via Reservation source
  const cust1 = await syncCustomerFromSource({
    name: "Verification Customer",
    phone: "+91 99999 99999",
    email: "verify_test@humtum.in",
    source: "reservation"
  });

  if (!cust1) throw new Error("Customer profile sync returned null");
  console.log(`[Verification] Created customer: ${cust1.name} (Visits: ${cust1.visitsCount})`);

  // 4. Register same Customer via Check-In source (should merge instead of duplicating)
  const cust2 = await syncCustomerFromSource({
    name: "Verification Customer Updated",
    phone: "9999999999", // Different format
    email: "verify_test@humtum.in",
    source: "check-in",
    extraDetails: {
      dob: "1990-06-20",
      anniversary: "2015-06-20",
      gender: "Male",
      address: "123 Verification Street, Gorakhpur",
      aadhaarNumber: "1234 5678 9012"
    }
  });

  if (cust1._id.toString() !== cust2._id.toString()) {
    throw new Error("Duplicate customer profiles were created instead of matching & merging!");
  }

  if (cust2.name !== "Verification Customer Updated" || cust2.gender !== "Male" || cust2.aadhaarNumber !== "123456789012") {
    throw new Error("Customer profile fields failed to update on merge!");
  }

  console.log("[Verification] Match & Merge validation PASSED.");

  // 5. Trigger Welcome Automation
  console.log("[Verification] Triggering welcome automations...");
  await triggerWelcomeAutomation(cust2, staff._id, "Verification check-in test");

  // Re-fetch customer to assert visits increment
  const updatedCust = await Customer.findById(cust2._id);
  if (updatedCust.visitsCount !== 1) {
    throw new Error(`Expected visit count of 1, got: ${updatedCust.visitsCount}`);
  }

  console.log(`[Verification] Checked in visitor! New visits count: ${updatedCust.visitsCount}`);

  // Assert Visit log document
  const visit = await Visit.findOne({ customerId: cust2._id });
  if (!visit || visit.notes !== "Verification check-in test") {
    throw new Error("Visit log document was not recorded correctly!");
  }

  console.log("[Verification] Welcome Automation triggers PASSED.");

  // 6. Clean up verification test data
  console.log("[Verification] Cleaning up test records...");
  await Customer.deleteOne({ _id: cust2._id });
  await Visit.deleteMany({ customerId: cust2._id });
  await CommunicationLog.deleteMany({ customerId: cust2._id });

  console.log("\n[Verification] ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ✅");
  process.exit(0);
}

verifyCRM().catch(err => {
  console.error("\n[Verification] Test Run FAILED: ❌", err);
  process.exit(1);
});
