import { NextResponse } from "next/server";
import { posDbConnect } from "@/lib/db";
import { ObjectId } from "mongodb";

function getISTBusinessDayBoundary() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const dateParts = {};
  parts.forEach(p => dateParts[p.type] = parseInt(p.value, 10));

  let year = dateParts.year;
  let month = dateParts.month - 1; // 0-indexed
  let day = dateParts.day;
  let hour = dateParts.hour;

  // If before 5 AM IST, the business day started yesterday
  if (hour < 5) {
    const tempDate = new Date(Date.UTC(year, month, day));
    tempDate.setUTCDate(tempDate.getUTCDate() - 1);
    year = tempDate.getUTCFullYear();
    month = tempDate.getUTCMonth();
    day = tempDate.getUTCDate();
  }

  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const isoStr = `${year}-${monthStr}-${dayStr}T05:00:00.000+05:30`;
  return new Date(isoStr);
}

function getISTBusinessDateString(date = new Date()) {
  const d = new Date(date);
  const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  let year = istTime.getUTCFullYear();
  let month = istTime.getUTCMonth();
  let dateVal = istTime.getUTCDate();
  let hour = istTime.getUTCHours();
  if (hour < 5) {
    const prevDay = new Date(Date.UTC(year, month, dateVal - 1));
    year = prevDay.getUTCFullYear();
    month = prevDay.getUTCMonth();
    dateVal = prevDay.getUTCDate();
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(dateVal).padStart(2, '0')}`;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { tableNumber, customerName, customerMobile, activeCart } = body;

    if (!tableNumber) {
      return NextResponse.json({ success: false, error: "Table number is required" }, { status: 400 });
    }

    const tableNum = parseInt(tableNumber);
    if (isNaN(tableNum)) {
      return NextResponse.json({ success: false, error: "Invalid table number" }, { status: 400 });
    }

    const conn = await posDbConnect();

    // Check if table has an active session
    let session = await conn.db.collection("tablesessions").findOne({
      tableNo: tableNum,
      status: { $ne: "COMPLETED" }
    });

    if (activeCart && activeCart.length > 0) {
      // If no active session, open a new session and create an order
      if (!session) {
        const orderInsert = await conn.db.collection("orders").insertOne({
          billNo: "",
          businessDate: getISTBusinessDateString(new Date()),
          tableNo: tableNum,
          items: [],
          subtotal: 0,
          sgst: 0,
          cgst: 0,
          discount: 0,
          roundOff: 0,
          grandTotal: 0,
          paidAmount: 0,
          paymentMode: "cash",
          orderStatus: "OPEN",
          isActive: true,
          date: new Date(),
          waiterName: "",
          orderType: "dine-in",
          customerName: customerName || "",
          customerPhone: customerMobile || "",
          createdAt: new Date(),
          updatedAt: new Date()
        });

        const sessionInsert = await conn.db.collection("tablesessions").insertOne({
          tableNo: tableNum,
          activeOrderId: orderInsert.insertedId,
          status: "OPEN",
          kotIds: [],
          openedAt: new Date(),
          lastActivityAt: new Date(),
          paymentReceived: false,
          totalAmount: 0,
          waiterName: "",
          orderType: "dine-in",
          pendingItems: [],
          customerMobile: customerMobile ? customerMobile.trim() : "",
          customerName: customerName ? customerName.trim() : ""
        });

        session = {
          _id: sessionInsert.insertedId,
          tableNo: tableNum,
          activeOrderId: orderInsert.insertedId,
          status: "OPEN",
          kotIds: [],
          pendingItems: []
        };
      } else if (session.activeOrderId) {
        // If session exists, update order customer details
        await conn.db.collection("orders").updateOne(
          { _id: session.activeOrderId },
          {
            $set: {
              customerName: customerName || "",
              customerPhone: customerMobile || "",
              updatedAt: new Date()
            }
          }
        );
      }

      // Map cart to pendingItems
      const pendingItems = activeCart.map(item => ({
        menuItemId: item.menuItemId ? new ObjectId(item.menuItemId) : null,
        name: item.name,
        quantity: parseInt(item.quantity) || 1,
        price: parseFloat(item.price) || 0,
        department: (item.department === "bar" || item.menuSection === "bar") ? "bar" : "kitchen",
        notes: item.notes || ""
      }));

      await conn.db.collection("tablesessions").updateOne(
        { _id: session._id },
        {
          $set: {
            pendingItems,
            lastActivityAt: new Date()
          }
        }
      );
    } else {
      // Cart is empty — just clear pendingItems from the session (don't delete it,
      // KOTs may already have been placed and the table is genuinely busy).
      if (session) {
        await conn.db.collection("tablesessions").updateOne(
          { _id: session._id },
          { $set: { pendingItems: [], lastActivityAt: new Date() } }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Cart synced successfully"
    });

  } catch (error) {
    console.error("Error syncing cart:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
