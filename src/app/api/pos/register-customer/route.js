import { NextResponse } from "next/server";
import { posDbConnect } from "@/lib/db";
import { ObjectId } from "mongodb";
import { syncCustomerFromSource } from "@/lib/crm";

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

async function broadcastTableSessionUpdate(tableNum) {
  try {
    const socketUrl = process.env.NEXT_PUBLIC_POS_SOCKET_URL || "http://localhost:3000";
    const { io } = await import("socket.io-client");
    const tempSocket = io(socketUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000
    });

    await new Promise((resolve) => {
      tempSocket.on("connect", () => {
        tempSocket.emit("admin-broadcast", {
          event: "TABLE_SESSION_UPDATED",
          tableNumber: tableNum
        });
        tempSocket.emit("admin-broadcast", {
          event: "TABLE_UPDATED",
          tableNumber: tableNum
        });
        setTimeout(() => {
          tempSocket.disconnect();
          resolve();
        }, 200);
      });

      tempSocket.on("connect_error", () => {
        resolve();
      });

      // Timeout fallback
      setTimeout(resolve, 3500);
    });
  } catch (err) {
    console.error("Failed to broadcast TABLE_SESSION_UPDATED:", err?.message || err);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { tableNumber, customerName, customerMobile } = body;

    if (!tableNumber) {
      return NextResponse.json({ success: false, error: "Table number is required" }, { status: 400 });
    }

    const tableNum = parseInt(tableNumber);
    if (isNaN(tableNum)) {
      return NextResponse.json({ success: false, error: "Invalid table number" }, { status: 400 });
    }

    if (!customerName || customerName.trim().length < 2) {
      return NextResponse.json({ success: false, error: "Please enter a valid Customer Name" }, { status: 400 });
    }

    if (!customerMobile || !/^\d{10}$/.test(customerMobile.trim())) {
      return NextResponse.json({ success: false, error: "Please enter a valid 10-digit mobile number" }, { status: 400 });
    }

    // 1. Sync to CRM immediately
    let customer = null;
    try {
      customer = await syncCustomerFromSource({
        name: customerName.trim(),
        phone: customerMobile.trim(),
        source: "ordering-menu"
      });
      console.log(`[CRM Sync] Customer ${customerName} (${customerMobile}) synced successfully.`);
    } catch (crmErr) {
      console.error("Failed to sync customer to CRM:", crmErr.message);
    }

    // 2. Connect to POS DB and register/update active tablesession & orders
    const conn = await posDbConnect();

    // Check if table has an active session
    let session = await conn.db.collection("tablesessions").findOne({
      tableNo: tableNum,
      status: { $ne: "COMPLETED" }
    });

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
        customerName: customerName.trim(),
        customerPhone: customerMobile.trim(),
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
        customerMobile: customerMobile.trim(),
        customerName: customerName.trim()
      });

      session = {
        _id: sessionInsert.insertedId,
        tableNo: tableNum,
        activeOrderId: orderInsert.insertedId,
        status: "OPEN",
        kotIds: [],
        pendingItems: []
      };
    } else {
      // Session exists, update details
      const updateFields = {
        customerName: customerName.trim(),
        customerMobile: customerMobile.trim(),
        lastActivityAt: new Date()
      };
      await conn.db.collection("tablesessions").updateOne(
        { _id: session._id },
        { $set: updateFields }
      );

      if (session.activeOrderId) {
        await conn.db.collection("orders").updateOne(
          { _id: session.activeOrderId },
          {
            $set: {
              customerName: customerName.trim(),
              customerPhone: customerMobile.trim(),
              updatedAt: new Date()
            }
          }
        );
      }
    }

    // 3. Broadcast Socket.IO update
    await broadcastTableSessionUpdate(tableNum);

    return NextResponse.json({
      success: true,
      message: "Customer registered successfully",
      customerId: customer ? customer._id.toString() : null,
      tableSessionId: session._id ? session._id.toString() : null
    });

  } catch (error) {
    console.error("Error registering customer:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
