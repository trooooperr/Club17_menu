
function getEffectiveBusinessDate(inputDate = new Date()) {
  const d = new Date(inputDate);
  const istTime = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const istHour = istTime.getUTCHours();
  if (istHour < 5) {
    return new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }
  return d;
}
import dbConnect, { Customer, CRMSettings, CommunicationLog, Visit } from "./db";
import nodemailer from "nodemailer";
function getEmailTemplate(title, content) { return `<div style="font-family:sans-serif;padding:20px;color:#333"><h2>${title}</h2><div>${content}</div></div>`; }
import { sendWhatsAppMessage } from "./whatsapp";
import path from "path";
import fs from "fs";

/**
 * Retrieve global CRM settings document, or create it using default values if missing.
 */
export async function getCRMSettings() {
  await dbConnect();
  let settings = await CRMSettings.findOne({});
  if (!settings) {
    settings = await CRMSettings.create({});
  }
  return settings;
}

/**
 * Normalize phone numbers to facilitate accurate duplicate matching
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return "";
  // Strip all non-numeric characters except +
  let cleaned = phone.toString().trim().replace(/[^\d+]/g, "");
  // Standardize Indian numbers: if starts with 0, replace with +91 or strip.
  // E.g., 9876543210 -> 919876543210
  if (cleaned.length === 10 && !cleaned.startsWith("+")) {
    cleaned = "+91" + cleaned;
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = "+" + cleaned;
  } else if (cleaned.startsWith("0")) {
    cleaned = "+91" + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Programmatic smart duplicate detection & customer sync
 */
export async function syncCustomerFromSource({ name, phone, email, source, extraDetails = {} }) {
  await dbConnect();

  const normalizedPhone = phone ? normalizePhoneNumber(phone) : "";
  const normalizedEmail = email ? email.toLowerCase().trim() : "";

  if (!normalizedPhone && !normalizedEmail) {
    throw new Error("Either phone or email is required for customer synchronization");
  }

  let customer = null;

  // 1. Try search by phone
  if (normalizedPhone) {
    customer = await Customer.findOne({ phone: normalizedPhone });
  }

  // 2. Try search by email if not found by phone
  if (!customer && normalizedEmail) {
    customer = await Customer.findOne({ email: normalizedEmail });
  }

  // 3. Try search by Aadhaar number if provided and not matched yet
  const normalizedAadhaar = extraDetails.aadhaarNumber ? extraDetails.aadhaarNumber.toString().trim().replace(/\D/g, "") : "";
  if (!customer && normalizedAadhaar && normalizedAadhaar.length === 12) {
    customer = await Customer.findOne({ aadhaarNumber: normalizedAadhaar });
  }

  const sourceName = source || "unknown";

  if (customer) {
    // Merge information, retaining existing data, overwriting empty/default values
    let isModified = false;

    if (name && name.trim() && customer.name !== name.trim()) {
      customer.name = name.trim();
      isModified = true;
    }
    if (normalizedPhone && customer.phone !== normalizedPhone) {
      customer.phone = normalizedPhone;
      isModified = true;
    }
    if (normalizedEmail && customer.email !== normalizedEmail) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (emailRegex.test(normalizedEmail)) {
        customer.email = normalizedEmail;
        isModified = true;
      }
    }
    if (normalizedAadhaar && customer.aadhaarNumber !== normalizedAadhaar) {
      customer.aadhaarNumber = normalizedAadhaar;
      isModified = true;
    }

    // Merge extra fields if provided
    if (extraDetails.dob && customer.dob !== extraDetails.dob) {
      customer.dob = extraDetails.dob;
      isModified = true;
    }
    if (extraDetails.anniversary && customer.anniversary !== extraDetails.anniversary) {
      customer.anniversary = extraDetails.anniversary;
      isModified = true;
    }
    if (extraDetails.gender && customer.gender !== extraDetails.gender) {
      customer.gender = extraDetails.gender;
      isModified = true;
    }
    if (extraDetails.address && customer.address !== extraDetails.address) {
      customer.address = extraDetails.address;
      isModified = true;
    }

    // Append source if not already present
    if (!customer.sources.includes(sourceName)) {
      customer.sources.push(sourceName);
      isModified = true;
    }

    const effectiveVisitDate = getEffectiveBusinessDate();
    customer.lastVisitDate = effectiveVisitDate;
    customer.visitsCount = (customer.visitsCount || 0) + 1;
    await customer.save();

    await Visit.create({
      customerId: customer._id,
      notes: `Order placed via ${sourceName}`,
      timestamp: effectiveVisitDate
    }).catch(err => console.error("Visit log creation error:", err.message));
  } else {
    // Create brand new customer
    const effectiveVisitDate = getEffectiveBusinessDate();
    customer = await Customer.create({
      name: name ? name.trim() : (normalizedEmail ? normalizedEmail.split("@")[0] : "Walk-in Guest"),
      phone: normalizedPhone,
      email: normalizedEmail,
      aadhaarNumber: normalizedAadhaar || "",
      dob: extraDetails.dob || "",
      anniversary: extraDetails.anniversary || "",
      gender: extraDetails.gender || "",
      address: extraDetails.address || "",
      sources: [sourceName],
      visitsCount: 1,
      lastVisitDate: effectiveVisitDate
    });

    await Visit.create({
      customerId: customer._id,
      notes: `Initial order placed via ${sourceName}`,
      timestamp: effectiveVisitDate
    }).catch(err => console.error("Visit log creation error:", err.message));
  }

  return customer;
}

/**
 * Triggers automated welcome email and WhatsApp messages on customer check-in.
 */
export async function triggerWelcomeAutomation(customer, checkInUserId = null, notes = "", additionalGuests = 0) {
  await dbConnect();
  
  // 1. Create a Visit record
  await Visit.create({
    customerId: customer._id,
    checkInUserId,
    notes,
    additionalGuests
  });

  // 2. Increment customer visit counts and update last visit date
  customer.visitsCount += 1;
  customer.lastVisitDate = new Date();
  if (!customer.sources.includes("check-in")) {
    customer.sources.push("check-in");
  }
  await customer.save();

  const settings = await getCRMSettings();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // PDF URLs for Menu Files
  const foodMenuUrl = `${appUrl}/uploads/food_menu.pdf`;
  const barMenuUrl = `${appUrl}/uploads/bar_menu.pdf`;

  // Format templates
  const templateVars = {
    name: customer.name,
    food_menu_link: foodMenuUrl,
    bar_menu_link: barMenuUrl,
    reserve_link: settings.reservationLink,
    instagram_link: settings.instagramLink,
    review_link: settings.googleReviewLink,
  };

  const formatTemplate = (templateStr) => {
    let formatted = templateStr;
    Object.keys(templateVars).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
      formatted = formatted.replace(regex, templateVars[key]);
    });
    return formatted;
  };

  // ────────────────────────────────────────────────────────
  // EMAIL WELCOME DISPATCH
  // ────────────────────────────────────────────────────────
  if (customer.email) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || `"Humtum" <${smtpUser}>`;

    const isSmtpConfigured = 
      smtpHost && smtpPort && smtpUser && smtpPass &&
      smtpHost !== "smtp.your-email-provider.com" &&
      smtpUser !== "hello@yourdomain.com" &&
      smtpPass !== "your-secure-password";

    if (isSmtpConfigured) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort),
          secure: parseInt(smtpPort) === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const subject = "✦ Welcome back to HUMTUM The BAR & Restaurant";
        const rawBody = formatTemplate(settings.welcomeEmailTemplate);
        
        // Append quick action buttons and visual PDF menu section to standard email body
        const emailContent = `
          ${rawBody}
          
          <!-- Menu PDF Section with Cover Image Thumbnails -->
          <div style="margin-top: 25px; margin-bottom: 25px; border-top: 1px dashed #eaeaea; padding-top: 25px;">
            <p style="font-family: 'Playfair Display', 'Didot', 'Georgia', serif; font-size: 16px; font-weight: bold; color: #c9a84c; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1.5px; text-align: center;">✦ Our Menus ✦</p>
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 10px;">
              <tr>
                <td width="50%" align="center" style="padding-right: 8px; vertical-align: top;">
                  <a href="${foodMenuUrl}" target="_blank" style="text-decoration: none; display: block; text-align: center;">
                    <img src="${appUrl}/food_menu_thumb.webp" alt="Food Menu" width="180" style="width: 100%; max-width: 180px; border-radius: 8px; border: 1px solid #eaeaea; box-shadow: 0 4px 12px rgba(0,0,0,0.08); display: block; margin: 0 auto 10px auto;" />
                    <span style="font-family: 'Lato', 'Helvetica', 'Arial', sans-serif; font-size: 12px; font-weight: bold; color: #c9a84c; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Open Food Menu (PDF)</span>
                  </a>
                </td>
                <td width="50%" align="center" style="padding-left: 8px; vertical-align: top;">
                  <a href="${barMenuUrl}" target="_blank" style="text-decoration: none; display: block; text-align: center;">
                    <img src="${appUrl}/bar_menu_thumb.webp" alt="Bar Menu" width="180" style="width: 100%; max-width: 180px; border-radius: 8px; border: 1px solid #eaeaea; box-shadow: 0 4px 12px rgba(0,0,0,0.08); display: block; margin: 0 auto 10px auto;" />
                    <span style="font-family: 'Lato', 'Helvetica', 'Arial', sans-serif; font-size: 12px; font-weight: bold; color: #c9a84c; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">Open Bar Menu (PDF)</span>
                  </a>
                </td>
              </tr>
            </table>
          </div>

          <!-- Bottom Action Buttons with spacing compatible with all clients -->
          <div style="margin-top: 30px; border-top: 1px dashed #eaeaea; padding-top: 25px;">
            <p style="font-size: 13px; color: #777777; margin: 0 0 15px 0; font-family: 'Lato', sans-serif;">Explore our online services:</p>
            <div style="margin-top: 10px;">
              <a href="${settings.reservationLink}" target="_blank" style="background-color: #c9a84c; color: white; text-decoration: none; padding: 10px 18px; font-size: 12px; font-weight: bold; border-radius: 4px; display: inline-block; font-family: 'Lato', sans-serif; margin-right: 12px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">Book Table</a>
              <a href="${settings.instagramLink}" target="_blank" style="background-color: #333333; color: white; text-decoration: none; padding: 10px 18px; font-size: 12px; font-weight: bold; border-radius: 4px; display: inline-block; font-family: 'Lato', sans-serif; margin-right: 12px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">Instagram</a>
              <a href="${settings.googleReviewLink}" target="_blank" style="background-color: #28a745; color: white; text-decoration: none; padding: 10px 18px; font-size: 12px; font-weight: bold; border-radius: 4px; display: inline-block; font-family: 'Lato', sans-serif; margin-right: 12px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">Write a Review</a>
            </div>
          </div>
        `;

        const attachments = [];
        if (settings.foodMenuBase64) {
          attachments.push({
            filename: "Humtum_Food_Menu.pdf",
            content: Buffer.from(settings.foodMenuBase64, "base64"),
            contentType: "application/pdf"
          });
        }
        if (settings.barMenuBase64) {
          attachments.push({
            filename: "Humtum_Bar_Menu.pdf",
            content: Buffer.from(settings.barMenuBase64, "base64"),
            contentType: "application/pdf"
          });
        }

        const mailOptions = {
          from: smtpFrom,
          to: customer.email,
          subject: subject,
          html: getEmailTemplate("Welcome to HUMTUM", emailContent, false),
          attachments,
        };

        const emailLog = await CommunicationLog.create({
          customerId: customer._id,
          type: "welcome",
          channel: "email",
          recipient: customer.email,
          subject: subject,
          message: emailContent,
          status: "sent"
        });

        // Use open tracking pixel redirection
        const trackingPixel = `<img src="${appUrl}/api/track/open?logId=${emailLog._id}" width="1" height="1" style="display:none;" />`;
        mailOptions.html = mailOptions.html.replace("</div>\n    </div>", `${trackingPixel}</div>\n    </div>`);

        await transporter.sendMail(mailOptions);
        console.log(`[CRM welcome] Welcome email sent successfully to ${customer.email}`);

      } catch (err) {
        console.error("[CRM welcome] Welcome email dispatch failed:", err);
        try {
          const log = await CommunicationLog.findOne({ customerId: customer._id, channel: "email" }).sort({ sentAt: -1 });
          if (log && log.status === "sent" && !log.error) {
            log.status = "failed";
            log.error = err.message;
            await log.save();
          } else {
            await CommunicationLog.create({
              customerId: customer._id,
              type: "welcome",
              channel: "email",
              recipient: customer.email,
              subject: "✦ Welcome to HUMTUM",
              message: "Email body failed to dispatch",
              status: "failed",
              error: err.message
            });
          }
        } catch (dbErr) {
          // Ignore secondary DB error
        }
      }
    } else {
      console.warn("[CRM welcome] SMTP credentials not set. Skipped email dispatch.");
    }
  }

  // ────────────────────────────────────────────────────────
  // WHATSAPP WELCOME DISPATCH
  // ────────────────────────────────────────────────────────
  if (customer.phone) {
    try {
      const rawText = formatTemplate(settings.welcomeWhatsappTemplate);
      const textWithLinks = `${rawText}\n\n` + 
        `🍽️ Food Menu: ${foodMenuUrl}\n` +
        `🍷 Bar Menu: ${barMenuUrl}\n\n` +
        `📅 Bookings: ${settings.reservationLink}\n` +
        `📸 Instagram: ${settings.instagramLink}\n` +
        `⭐ Review Us: ${settings.googleReviewLink}`;

      const waRes = await sendWhatsAppMessage({
        to: customer.phone,
        text: textWithLinks
      });

      await CommunicationLog.create({
        customerId: customer._id,
        type: "welcome",
        channel: "whatsapp",
        recipient: customer.phone,
        subject: "Welcome Check-In WhatsApp",
        message: textWithLinks,
        status: waRes.success ? "sent" : "failed",
        error: waRes.success ? undefined : waRes.error
      });

      if (waRes.success) {
        console.log(`[CRM welcome] Welcome WhatsApp dispatched to ${customer.phone}`);
      } else {
        console.error(`[CRM welcome] Welcome WhatsApp failed:`, waRes.error);
      }

    } catch (whatsappErr) {
      console.error("[CRM welcome] WhatsApp dispatch error:", whatsappErr);
    }
  }
}
