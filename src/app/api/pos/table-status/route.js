import { NextResponse } from "next/server";
import { posDbConnect } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tableNumberStr = searchParams.get("table");

    if (!tableNumberStr) {
      return NextResponse.json({ success: false, error: "Table number is required" }, { status: 400 });
    }

    const tableNumber = parseInt(tableNumberStr);
    if (isNaN(tableNumber)) {
      return NextResponse.json({ success: false, error: "Invalid table number" }, { status: 400 });
    }

    const conn = await posDbConnect();
    
    // Find active table session from POS database
    const session = await conn.db.collection("tablesessions").findOne({
      tableNo: tableNumber,
      status: { $ne: "COMPLETED" }
    });

    let activeOrder = null;
    if (session && session.activeOrderId) {
      activeOrder = await conn.db.collection("orders").findOne({
        _id: new ObjectId(session.activeOrderId)
      });
    }

    // Count KOTs for this order to determine if session is real
    let kotCount = 0;
    if (activeOrder) {
      kotCount = await conn.db.collection("kots").countDocuments({ orderId: activeOrder._id });
    }

    // Map pending items to include menuItemId as string
    const activeCart = session && Array.isArray(session.pendingItems)
      ? session.pendingItems.map(item => ({
          menuItemId: item.menuItemId ? item.menuItemId.toString() : "",
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          category: item.category || (item.department === "bar" ? "drinks" : "mains"),
          menuSection: item.department === "bar" ? "bar" : "kitchen"
        }))
      : [];

    // A table is truly busy only when:
    // 1. Session exists and is not COMPLETED
    // 2. AND there is either a real customer registered OR at least one KOT placed OR pending cart items
    // This prevents phantom sessions (POS opened table without any order) from showing as "busy"
    const hasRealCustomer = !!(activeOrder && (activeOrder.customerPhone || activeOrder.customerName));
    const hasPendingItems = Array.isArray(session?.pendingItems) && session.pendingItems.length > 0;
    const hasKOTs = kotCount > 0;

    const isBusy =
      session &&
      session.status !== "COMPLETED" &&
      (hasRealCustomer || hasKOTs || hasPendingItems);

    return NextResponse.json({
      success: true,
      table: {
        tableNumber: tableNumber,
        status: isBusy ? "busy" : "idle",
        customerName: activeOrder ? activeOrder.customerName : "",
        customerMobile: activeOrder ? activeOrder.customerPhone : "",
        waiterName: session ? session.waiterName : "",
        activeCart: activeCart
      },
      activeOrder: activeOrder && isBusy ? {
        orderId: activeOrder._id.toString(),
        items: activeOrder.items || [],
        totalAmount: activeOrder.grandTotal || 0,
        createdAt: activeOrder.createdAt
      } : null
    });

  } catch (error) {
    console.error("Error fetching table status:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
