// WhatsApp client stub — WhatsApp Web automation is disabled in production serverless environments.
// All functions safely resolve with disabled status without spawning heavy Chrome processes.

export async function initWhatsAppClient() {
  console.log("[WhatsApp] Client initialization bypassed. WhatsApp system is disabled.");
  return null;
}

export function getWhatsAppStatus() {
  return {
    status: "disconnected",
    qr: null,
  };
}

export async function logoutWhatsApp() {
  return { success: true };
}

export async function resetWhatsAppClient() {
  return { status: "disconnected" };
}

export async function sendWhatsAppMessage({ to, text }) {
  console.log("[WhatsApp] sendWhatsAppMessage bypassed. WhatsApp system is disabled.");
  return { success: false, error: "WhatsApp system is disabled on serverless" };
}
