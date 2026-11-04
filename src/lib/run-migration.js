// Historical database migration runner
import "./load-env";
import dbConnect, { Subscriber, Reservation, Contact } from "./db";
import { syncCustomerFromSource } from "./crm";

async function runMigration() {
  console.log("[Migration] Establishing database connection...");
  await dbConnect();
  console.log("[Migration] Connected. Fetching historical data...");

  const [subscribers, reservations, contacts] = await Promise.all([
    Subscriber.find({}),
    Reservation.find({}),
    Contact.find({})
  ]);

  console.log(`[Migration] Found:
  - Subscribers: ${subscribers.length}
  - Reservations: ${reservations.length}
  - Contacts: ${contacts.length}
  `);

  let subCount = 0;
  for (const s of subscribers) {
    if (s.email) {
      try {
        await syncCustomerFromSource({
          email: s.email,
          source: "newsletter"
        });
        subCount++;
      } catch (err) {
        console.error(`[Migration] Failed subscriber ${s.email}:`, err.message);
      }
    }
  }

  let resCount = 0;
  for (const r of reservations) {
    if (r.phone || r.email) {
      try {
        await syncCustomerFromSource({
          name: r.name,
          phone: r.phone,
          email: r.email,
          source: "reservation"
        });
        resCount++;
      } catch (err) {
        console.error(`[Migration] Failed reservation ${r.phone}/${r.email}:`, err.message);
      }
    }
  }

  let conCount = 0;
  for (const c of contacts) {
    if (c.phone || c.email) {
      try {
        await syncCustomerFromSource({
          name: c.name,
          phone: c.phone,
          email: c.email,
          source: "contact"
        });
        conCount++;
      } catch (err) {
        console.error(`[Migration] Failed contact message ${c.phone}/${c.email}:`, err.message);
      }
    }
  }

  console.log(`[Migration] Success:
  - Merged Subscribers: ${subCount} / ${subscribers.length}
  - Merged Reservations: ${resCount} / ${reservations.length}
  - Merged Contacts: ${conCount} / ${contacts.length}
  `);
  
  console.log("[Migration] Database migration completed successfully.");
  process.exit(0);
}

runMigration().catch(err => {
  console.error("[Migration] Fatal migration error:", err);
  process.exit(1);
});
