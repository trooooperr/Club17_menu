import { initWhatsAppClient, getWhatsAppStatus } from "../src/lib/whatsapp.js";

(async () => {
  try {
    await initWhatsAppClient();
    const status = getWhatsAppStatus();
    console.log('WhatsApp status:', status);
  } catch (e) {
    console.error('Error during init:', e);
  }
})();
