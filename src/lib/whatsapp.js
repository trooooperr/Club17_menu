process.env.WS_NO_BUFFER_UTIL = "true";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import chromiumPkg from "@sparticuz/chromium";
const { executablePath, args: chromiumArgs } = chromiumPkg;

import fs from "fs";
import path from "path";
import qrcode from "qrcode";
import os from "os";

// Resolve Chromium executable path with fallbacks
async function getExecutablePath() {
  // Prefer known system Chrome locations (Vercel provides Chrome with all dependencies)
  const systemCandidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-unstable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const c of systemCandidates) {
    try {
      // Check that the file exists and is executable
      require('fs').accessSync(c, require('fs').constants.X_OK);
      console.log('[WhatsApp] Using system Chrome executable:', c);
      return c;
    } catch (_) {}
  }
  // If no system binary found, fall back to bundled Chromium from @sparticuz/chromium
  try {
    const bundledPath = await executablePath();
    if (bundledPath) {
      console.log('[WhatsApp] Using bundled Chromium from @sparticuz/chromium:', bundledPath);
      return bundledPath;
    }
  } catch (_) {}
  // Honor any explicit env overrides (useful for custom buildpacks)
  if (process.env.CHROME_EXECUTABLE_PATH) {
    console.log('[WhatsApp] Using CHROME_EXECUTABLE_PATH env:', process.env.CHROME_EXECUTABLE_PATH);
    return process.env.CHROME_EXECUTABLE_PATH;
  }
  if (process.env.CHROMIUM_PATH) {
    console.log('[WhatsApp] Using CHROMIUM_PATH env:', process.env.CHROMIUM_PATH);
    return process.env.CHROMIUM_PATH;
  }
  console.warn('[WhatsApp] No Chrome executable found; puppeteer will use its default (may fail).');
  return undefined;
}

/**
 * Stateful variables to track connection status and QR code
 */
let client = null;
let clientStatus = "disconnected"; // "disconnected", "connecting", "qr", "ready", "unsupported"
let lastQR = null;                 // base64 Data URL of the QR code
let clientPromise = null;

/**
 * Returns a writable directory for auth data.
 * Falls back safely if /tmp is not available.
 */
function getAuthPath() {
  // Prefer /tmp on serverless, fallback to os.tmpdir()
  const candidates = ["/tmp/whatsapp_auth", path.join(os.tmpdir(), "whatsapp_auth")];
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      // Also create the session subdirectory that whatsapp-web.js needs
      fs.mkdirSync(path.join(candidate, "session"), { recursive: true });
      return candidate;
    } catch (e) {
      console.warn(`[WhatsApp] Auth path ${candidate} not writable:`, e.message);
    }
  }
  return null;
}

/**
 * Cleanup any stale browser instance and remove existing session data.
 * Used when Puppeteer reports that a browser is already running for the userDataDir.
 */
async function cleanupStaleBrowser() {
  try {
    if (client) {
      await client.destroy();
    }
  } catch (e) {
    console.warn('[WhatsApp] Error destroying stale client:', e.message);
  }
  // Remove the session directory to allow a fresh start
  const authPath = getAuthPath();
  if (authPath) {
    const sessionDir = path.join(authPath, "session");
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('[WhatsApp] Stale session directory removed');
    } catch (e) {
      console.warn('[WhatsApp] Failed to remove stale session directory:', e.message);
    }
  }
}


/**
 * Initializes the WhatsApp Web client if it hasn't been initialized yet.
 * (Bypassed: WhatsApp system is disabled)
 */
export async function initWhatsAppClient() {
  if (clientPromise) return clientPromise;
  console.log("[WhatsApp] Client initialization bypassed. WhatsApp system is disabled.");
  clientStatus = "disconnected";
  clientPromise = Promise.resolve(null);
  return clientPromise;
}

/**
 * Returns current connection status and QR code (if any)
 */
export function getWhatsAppStatus() {
  return {
    status: clientStatus,
    qr: lastQR,
  };
}

/**
 * Disconnects the client, removes the session and resets the singleton state.
 */
export async function logoutWhatsApp() {
  if (client) {
    try {
      await client.logout();
    } catch (err) {
      console.error('[WhatsApp] Error during logout:', err);
    }
    try {
      await client.destroy();
    } catch (err) {
      console.error('[WhatsApp] Error during destroy:', err);
    }
  }
  client = null;
  clientPromise = null;
  clientStatus = 'disconnected';
  lastQR = null;
  return { success: true };
}

/**
 * Forcefully reset the WhatsApp client and its session.
 */
export async function resetWhatsAppClient() {
  console.log('[WhatsApp] Resetting client and session');
  await logoutWhatsApp();
  await cleanupStaleBrowser();
  clientPromise = null;
  client = null;
  clientStatus = 'disconnected';
  lastQR = null;
  return initWhatsAppClient();
}

/**
 * Send a simple text message via the free WhatsApp Web client.
 * (Bypassed: WhatsApp system is disabled)
 */
export async function sendWhatsAppMessage({ to, text }) {
  console.log("[WhatsApp] sendWhatsAppMessage bypassed. WhatsApp system is disabled.");
  return { success: false, error: "WhatsApp system is disabled" };
}

