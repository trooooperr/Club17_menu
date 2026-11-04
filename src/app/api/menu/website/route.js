import { NextResponse } from "next/server";
import dbConnect, { MenuItem } from "@/lib/db";
import { seedMenuItemsIfNeeded } from "@/lib/seed";

export async function GET(req) {
  try {
    await dbConnect();
    // await seedMenuItemsIfNeeded(); // Removed from hot GET path to prevent DB query storm

    const items = await MenuItem.find({}).sort({ category: 1, name: 1 });
    const menuItems = items
      .filter(item => {
        const nameLower = (item.name || "").toLowerCase().trim();
        return nameLower !== "clear" && nameLower !== "clear table";
      })
      .map(item => {
      const cleanPrice = parseFloat(item.price.toString().replace(/[^0-9.]/g, "")) || 0;
      let rawCat = (item.category || "").toLowerCase().trim();
      if (rawCat === "desserts" || rawCat === "dessert") {
        rawCat = "bar_bites";
      }
      const menuSection = rawCat === "drinks" ? "bar" : "kitchen";
      return {
        _id: item._id.toString(),
        name: item.name.replace(/\s*\(\s*30\s*ml\s*\)/gi, "").trim(),
        desc: item.desc,
        price: cleanPrice, // Number amount only
        tag: item.tag || "",
        badge: item.badge || "",
        category: rawCat,
        menuSection,
        createdAt: item.createdAt
      };
    });
    return NextResponse.json(
      { success: true, menuItems, source: "local" },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
        }
      }
    );
  } catch (error) {
    console.error("Error fetching website menu:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
