import { NextResponse } from "next/server";
import dbConnect, { posDbConnect, CommunicationLog } from "@/lib/db";
import { getCRMSettings } from "@/lib/crm";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { ObjectId } from "mongodb";

export async function POST(req) {
  try {
    // 1. Establish database connections
    await dbConnect();
    const conn = await posDbConnect();

    const body = await req.json();
    const { orderId, billNo, tableNo, phoneNumber } = body;

    let order = null;

    // 2. Query order based on available identifiers
    if (orderId && ObjectId.isValid(orderId)) {
      order = await conn.db.collection("orders").findOne({ _id: new ObjectId(orderId) });
    } else if (billNo) {
      order = await conn.db.collection("orders").findOne({ billNo: billNo });
    } else if (tableNo !== undefined && tableNo !== null) {
      const tableNum = parseInt(tableNo);
      if (!isNaN(tableNum)) {
        const results = await conn.db.collection("orders")
          .find({ tableNo: tableNum })
          .sort({ createdAt: -1 })
          .limit(1)
          .toArray();
        if (results && results.length > 0) {
          order = results[0];
        }
      }
    }

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found in POS database." }, { status: 404 });
    }

    // 3. Resolve recipient phone number
    const rawTo = phoneNumber || order.customerPhone || order.customerMobile;
    if (!rawTo) {
      return NextResponse.json({ success: false, error: "Recipient phone number is required but not found on the order." }, { status: 400 });
    }

    // Clean recipient phone number
    const to = rawTo.toString().replace(/[^\d+]/g, "").trim();
    const cleanTo = to.startsWith("91") && to.length === 12 ? "+" + to : to.length === 10 ? "+91" + to : to;

    // 4. Fetch CRM settings for Meta credentials
    const settings = await getCRMSettings();

    // 5. Format Bill Summary Text
    const billItemsText = (order.items || [])
      .map(item => `• ${item.name} (x${item.quantity}) - ₹${item.price * item.quantity}`)
      .join("\n");

    const formatVal = (val) => {
      const num = typeof val === "number" ? val : parseFloat(val) || 0;
      return num.toFixed(2);
    };

    const billDateStr = order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const whatsappText = `*HUMTUM*
Food & Drinks
--------------------------
*Bill No:* ${order.billNo || "N/A"}
*Table No:* ${order.tableNo || "N/A"}
*Date:* ${billDateStr}
*Customer:* ${order.customerName || "Guest"}
--------------------------
*Items Ordered:*
${billItemsText || "No items"}
--------------------------
*Subtotal:* ₹${formatVal(order.subtotal || 0)}
${order.discount ? `*Discount:* -₹${formatVal(order.discount)}\n` : ""}\
*CGST (2.5%):* ₹${formatVal(order.cgst || 0)}
*SGST (2.5%):* ₹${formatVal(order.sgst || 0)}
*Round Off:* ₹${formatVal(order.roundOff || 0)}
*Grand Total: ₹${Math.round(order.grandTotal || 0)}*
--------------------------
Thank you for dining with us! 😊
${settings.googleReviewLink ? `⭐ Write a review: ${settings.googleReviewLink}\n` : ""}\
${settings.instagramLink ? `📸 Follow us on Instagram: ${settings.instagramLink}\n` : ""}\
${settings.reservationLink ? `📅 Book a table: ${settings.reservationLink}` : ""}`;

    // 6. Send message
    const resWhatsApp = await sendWhatsAppMessage({
      to: cleanTo,
      text: whatsappText
    });

    // 7. Log communication
    const log = await CommunicationLog.create({
      customerId: order._id ? order._id.toString() : new ObjectId(),
      type: "billing",
      channel: "whatsapp",
      recipient: cleanTo,
      subject: `Bill No ${order.billNo || "N/A"} Invoice`,
      message: whatsappText,
      status: resWhatsApp.success ? "sent" : "failed",
      error: resWhatsApp.success ? undefined : resWhatsApp.error
    });

    if (resWhatsApp.success) {
      return NextResponse.json({
        success: true,
        message: `Bill WhatsApp sent successfully to ${cleanTo}`,
        logId: log._id.toString()
      });
    } else {
      return NextResponse.json({
        success: false,
        error: resWhatsApp.error || "Failed to send WhatsApp message"
      }, { status: 500 });
    }

  } catch (error) {
    console.error("WhatsApp invoice dispatch route error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
