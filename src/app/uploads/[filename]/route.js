import { NextResponse } from "next/server";
import dbConnect, { CRMSettings } from "@/lib/db";

export async function GET(req, { params }) {
  try {
    await dbConnect();
    const resolvedParams = await params;
    const { filename } = resolvedParams;

    if (filename !== "food_menu.pdf" && filename !== "bar_menu.pdf") {
      return new Response("Not Found", { status: 404 });
    }

    const settings = await CRMSettings.findOne();
    if (!settings) {
      return new Response("Menu Settings Not Configured", { status: 404 });
    }

    let base64 = "";
    if (filename === "food_menu.pdf") {
      base64 = settings.foodMenuBase64;
    } else {
      base64 = settings.barMenuBase64;
    }

    if (!base64) {
      return new Response("Menu PDF file has not been uploaded yet", { status: 404 });
    }

    const buffer = Buffer.from(base64, "base64");

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`
      }
    });

  } catch (err) {
    console.error("Error serving menu PDF:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
