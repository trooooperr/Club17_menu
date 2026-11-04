import { NextResponse } from "next/server";
import { posDbConnect } from "@/lib/db";
import { ObjectId } from "mongodb";

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

async function generateNextBillNo(conn, businessDateStr) {
  const existingOrders = await conn.db.collection("orders").find({
    businessDate: businessDateStr,
    billNo: { $regex: /^HTB-\d+$/ }
  }).project({ billNo: 1 }).toArray();

  let maxOrderNum = 0;
  for (const o of existingOrders) {
    const match = (o.billNo || '').match(/HTB-(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n > maxOrderNum) maxOrderNum = n;
    }
  }

  const counterDoc = await conn.db.collection("billcounters").findOneAndUpdate(
    { businessDate: businessDateStr },
    [
      {
        $set: {
          seq: {
            $add: [
              { $max: [{ $ifNull: ["$seq", 0] }, maxOrderNum] },
              1
            ]
          },
          updatedAt: new Date()
        }
      }
    ],
    { upsert: true, returnDocument: "after" }
  );

  const seqVal = counterDoc?.seq || (counterDoc?.value && counterDoc.value.seq) || 1;
  let candidateBillNo = `HTB-${seqVal.toString().padStart(3, '0')}`;

  let conflict = await conn.db.collection("orders").findOne({
    businessDate: businessDateStr,
    billNo: candidateBillNo
  });

  while (conflict) {
    const nextDoc = await conn.db.collection("billcounters").findOneAndUpdate(
      { businessDate: businessDateStr },
      { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    const nextSeq = nextDoc?.seq || (nextDoc?.value && nextDoc.value.seq) || (seqVal + 1);
    candidateBillNo = `HTB-${nextSeq.toString().padStart(3, '0')}`;
    conflict = await conn.db.collection("orders").findOne({
      businessDate: businessDateStr,
      billNo: candidateBillNo
    });
  }

  return candidateBillNo;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { tableNumber } = body;

    if (!tableNumber) {
      return NextResponse.json({ success: false, error: "Table number is required" }, { status: 400 });
    }

    const tableNum = parseInt(tableNumber);
    if (isNaN(tableNum)) {
      return NextResponse.json({ success: false, error: "Invalid table number" }, { status: 400 });
    }

    const conn = await posDbConnect();

    // Find the active table session from POS database
    const session = await conn.db.collection("tablesessions").findOne({
      tableNo: tableNum,
      status: { $ne: "COMPLETED" }
    });

    if (!session) {
      // Still broadcast ORDER_COMPLETED in case client is stuck
      await broadcastTableReset(tableNum);
      return NextResponse.json({ success: true, message: "Table reset successfully (no active session found)" });
    }

    let order = null;
    if (session.activeOrderId) {
      order = await conn.db.collection("orders").findOne({
        _id: new ObjectId(session.activeOrderId)
      });
    }

    if (!order) {
      // Just delete the table session if no active order is found
      await conn.db.collection("tablesessions").deleteOne({ _id: session._id });
      await broadcastTableReset(tableNum);
      return NextResponse.json({ success: true, message: "Table session cleared (no active order found)" });
    }

    const hasClearItem = (order.items || []).some(
      item => (item.name || "").toLowerCase().trim() === "clear" || (item.name || "").toLowerCase().trim() === "clear table"
    );

    if (hasClearItem) {
      // 1. Restore any deducted inventory stock from previously printed KOTs for this order
      try {
        const orderKots = await conn.db.collection("kots").find({ orderId: order._id }).toArray();
        for (const kot of orderKots) {
          if (kot.inventoryDeducted && kot.items) {
            for (const item of kot.items) {
              if (item.department === "bar") {
                const itemNameLower = (item.name || "").toLowerCase().trim();
                await conn.db.collection("inventories").updateOne(
                  { 
                    name: { $regex: new RegExp(`^${itemNameLower}$`, "i") },
                    trackStock: { $ne: false }
                  },
                  { $inc: { stock: item.quantity } } // Restore stock by adding it back
                );
              }
            }
          }
        }
      } catch (invErr) {
        console.error("Failed to restore inventory on table clear:", invErr.message);
      }

      // 2. Delete order completely from the orders collection (this removes it from history/analytics/reports)
      await conn.db.collection("orders").deleteOne({ _id: order._id });

      // 3. Delete any associated KOTs from the kots collection
      await conn.db.collection("kots").deleteMany({ orderId: order._id });

      // 4. Reset Table Session in POS database (delete it to free the table)
      await conn.db.collection("tablesessions").deleteOne({ _id: session._id });

      // 5. Broadcast ORDER_COMPLETED to clear cart/history instantly on client UI
      await broadcastTableReset(tableNum);

      return NextResponse.json({
        success: true,
        message: `Table ${tableNum} cleared successfully. Deducted inventory stock has been restored.`
      });
    }

    let finalBillNo = order.billNo;
    const bDate = order.businessDate || getISTBusinessDateString(new Date());
    if (!finalBillNo || finalBillNo === 'PENDING') {
      finalBillNo = await generateNextBillNo(conn, bDate);
    }

    // Update order status to COMPLETED, set paidAmount to grandTotal, and mark active as false (this finalizes it)
    await conn.db.collection("orders").updateOne(
      { _id: order._id },
      {
        $set: {
          billNo: finalBillNo,
          businessDate: bDate,
          orderStatus: "COMPLETED",
          isActive: false,
          paidAmount: order.grandTotal || 0,
          updatedAt: new Date()
        }
      }
    );



    // Trigger sending the bill on WhatsApp in the background if a phone number is registered
    const customerPhone = order.customerPhone || order.customerMobile;
    if (customerPhone && !hasClearItem) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      fetch(`${appUrl}/api/pos/billing/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order._id.toString(),
          phoneNumber: customerPhone
        })
      }).catch(err => {
        console.error("Failed to trigger background WhatsApp bill send:", err.message);
      });
    }

    // Reset Table Session in POS database (delete it to free the table)
    await conn.db.collection("tablesessions").deleteOne({ _id: session._id });

    // Broadcast ORDER_COMPLETED to all connected clients so they clear their cart/history instantly
    await broadcastTableReset(tableNum);

    return NextResponse.json({
      success: true,
      message: `Bill printed successfully for Table ${tableNum}. Table is now Idle.`,
      orderId: order._id.toString(),
      totalAmount: order.grandTotal || 0
    });

  } catch (error) {
    console.error("Error finalizing bill:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to finalize bill" }, { status: 500 });
  }
}

/**
 * Broadcasts ORDER_COMPLETED to all connected socket clients by connecting
 * as a temporary client to the POS socket server.
 * This fires-and-forgets so it never blocks the billing response.
 */
async function broadcastTableReset(tableNum) {
  try {
    const socketUrl = process.env.NEXT_PUBLIC_POS_SOCKET_URL || "http://localhost:3000";
    // Dynamically import socket.io-client to avoid SSR issues
    const { io } = await import("socket.io-client");
    const tempSocket = io(socketUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000
    });

    await new Promise((resolve) => {
      tempSocket.on("connect", () => {
        // Emit ORDER_COMPLETED to all rooms (server should broadcast this to all)
        tempSocket.emit("admin-broadcast", {
          event: "ORDER_COMPLETED",
          tableNumber: tableNum
        });
        // Small delay to ensure message is sent before disconnect
        setTimeout(() => {
          tempSocket.disconnect();
          resolve();
        }, 200);
      });

      // If connection fails, don't block
      tempSocket.on("connect_error", () => {
        resolve();
      });

      // Timeout fallback
      setTimeout(resolve, 3500);
    });
  } catch (err) {
    // Non-critical: log but don't fail the billing request
    console.error("Failed to broadcast ORDER_COMPLETED:", err?.message || err);
  }
}
