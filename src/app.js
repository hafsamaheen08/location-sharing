import { firebaseConfig } from "./firebase-config.js";

const els = {
  signalCard: document.querySelector(".signal-card"),
  consentScreen: document.getElementById("consentScreen"),
  consentText: document.getElementById("consentText"),
  consentShareButton: document.getElementById("consentShareButton"),
  consentStopButton: document.getElementById("consentStopButton"),
  consentStatus: document.getElementById("consentStatus"),
  signalLabel: document.getElementById("signalLabel"),
  signalDetail: document.getElementById("signalDetail"),
  inviteForm: document.getElementById("inviteForm"),
  countryCode: document.getElementById("countryCode"),
  phoneInput: document.getElementById("phoneInput"),
  messageInput: document.getElementById("messageInput"),
  autoSmsInput: document.getElementById("autoSmsInput"),
  linkCard: document.getElementById("linkCard"),
  inviteLink: document.getElementById("inviteLink"),
  copyButton: document.getElementById("copyButton"),
  smsButton: document.getElementById("smsButton"),
  dashboardButton: document.getElementById("dashboardButton"),
  testPermissionButton: document.getElementById("testPermissionButton"),
  googleMapFrame: document.getElementById("googleMapFrame"),
  googleMapsLink: document.getElementById("googleMapsLink"),
  mapTitle: document.getElementById("mapTitle"),
  mapSummary: document.getElementById("mapSummary"),
  marker: document.getElementById("locationMarker"),
  latitudeValue: document.getElementById("latitudeValue"),
  longitudeValue: document.getElementById("longitudeValue"),
  accuracyValue: document.getElementById("accuracyValue"),
  updatedValue: document.getElementById("updatedValue"),
  receiverCard: document.getElementById("receiverCard"),
  receiverText: document.getElementById("receiverText"),
  shareButton: document.getElementById("shareButton"),
  stopButton: document.getElementById("stopButton")
};

const channel = "BroadcastChannel" in window ? new BroadcastChannel("consent-location") : null;
const firebaseState = {
  enabled: false,
  databaseUrl: ""
};

let watchId = null;
let dashboardPollId = null;

const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const activeMode = params.get("mode") || "create";
const activeSession = params.get("id");
const activePhone = params.get("phone") || "";

function createSessionId() {
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return `loc-${Date.now().toString(36)}-${[...random].map((n) => n.toString(36)).join("")}`;
}

function cleanPhone(value) {
  return value.replace(/[^\d]/g, "");
}

function sessionKey(id) {
  return `location-session:${id}`;
}

function hasFirebaseConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);
}

function initFirebase() {
  if (!hasFirebaseConfig()) return false;

  firebaseState.databaseUrl = firebaseConfig.databaseURL.replace(/\/$/, "");
  firebaseState.enabled = true;
  return true;
}

function locationUrl(id) {
  return `${firebaseState.databaseUrl}/locations/${encodeURIComponent(id)}.json`;
}

async function writeRemoteLocation(id, location) {
  const response = await fetch(locationUrl(id), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(location)
  });

  if (!response.ok) {
    throw new Error(`Firebase write failed with status ${response.status}`);
  }
}

async function readRemoteLocation(id) {
  const response = await fetch(locationUrl(id), {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Firebase read failed with status ${response.status}`);
  }

  return response.json();
}

function setStatus(kind, label, detail) {
  els.signalCard.classList.remove("is-live", "is-warning", "is-error");
  if (kind) els.signalCard.classList.add(`is-${kind}`);
  els.signalLabel.textContent = label;
  els.signalDetail.textContent = detail;
  if (els.consentStatus) {
    els.consentStatus.textContent = detail;
  }
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : "--";
}

function formatTime(timestamp) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp);
}

function locationToMarker(location) {
  const lat = Math.abs(location.latitude % 1);
  const lng = Math.abs(location.longitude % 1);
  return {
    left: `${18 + lng * 64}%`,
    top: `${18 + lat * 58}%`
  };
}

function googleMapsUrl(location) {
  const lat = encodeURIComponent(location.latitude);
  const lng = encodeURIComponent(location.longitude);
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function googleMapsEmbedUrl(location) {
  const lat = encodeURIComponent(location.latitude);
  const lng = encodeURIComponent(location.longitude);
  return `https://www.google.com/maps?q=${lat},${lng}&z=17&output=embed`;
}

function renderLocation(location) {
  if (!location) return;

  els.latitudeValue.textContent = formatCoordinate(location.latitude);
  els.longitudeValue.textContent = formatCoordinate(location.longitude);
  els.accuracyValue.textContent = location.accuracy ? `${Math.round(location.accuracy)} m` : "--";
  els.updatedValue.textContent = formatTime(location.timestamp);

  const marker = locationToMarker(location);
  els.marker.style.left = marker.left;
  els.marker.style.top = marker.top;
  els.marker.classList.add("active");
  els.googleMapFrame.src = googleMapsEmbedUrl(location);
  els.googleMapFrame.hidden = false;
  els.googleMapsLink.href = googleMapsUrl(location);
  els.googleMapsLink.hidden = false;
  els.mapTitle.textContent = "Live location received";
  els.mapSummary.textContent = `Approximate position updated at ${formatTime(location.timestamp)} with browser permission.`;
  setStatus("live", "Live", "Location updates are active.");
}

async function saveLocation(id, location) {
  localStorage.setItem(sessionKey(id), JSON.stringify(location));
  channel?.postMessage({ type: "location", id, location });
  if (firebaseState.enabled) {
    try {
      await writeRemoteLocation(id, location);
      if (activeMode === "share") {
        els.consentStatus.textContent = "Location sent to the dashboard. Keep this page open to continue sharing.";
      }
    } catch (error) {
      setStatus("error", "Sync failed", "Location was allowed, but the realtime database rejected the update.");
      console.error("Firebase location write failed.", error);
    }
  } else if (activeMode === "share") {
    setStatus("error", "Sync not connected", "This deployed page does not have Firebase configured, so your dashboard cannot receive updates.");
  }
  renderLocation(location);
}

function readLocation(id) {
  try {
    return JSON.parse(localStorage.getItem(sessionKey(id)));
  } catch {
    return null;
  }
}

function createInviteLinks(sessionId, phoneNumber) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const shareLink = `${base}#mode=share&id=${encodeURIComponent(sessionId)}&phone=${encodeURIComponent(phoneNumber)}`;
  const dashboardLink = `${base}#mode=dashboard&id=${encodeURIComponent(sessionId)}`;
  const message = `${els.messageInput.value.trim()} ${shareLink}`.trim();
  const smsLink = `sms:${phoneNumber}?&body=${encodeURIComponent(message)}`;
  return { shareLink, dashboardLink, smsLink };
}

function showInvite(sessionId, phoneNumber) {
  const links = createInviteLinks(sessionId, phoneNumber);
  els.inviteLink.value = links.shareLink;
  els.smsButton.href = links.smsLink;
  els.dashboardButton.href = links.dashboardLink;
  els.testPermissionButton.href = links.shareLink;
  els.linkCard.hidden = false;
  els.mapTitle.textContent = "Invite ready";
  els.mapSummary.textContent = "The SMS composer is ready. The recipient still controls whether location is shared.";
  setStatus("warning", "SMS ready", "Review and send the consent message.");

  if (els.autoSmsInput.checked) {
    window.location.href = links.smsLink;
  }
}

function startDashboard(id) {
  const existing = readLocation(id);
  els.mapTitle.textContent = "Waiting for recipient";
  els.mapSummary.textContent = "Keep this dashboard open after sending the SMS invite.";
  setStatus(
    "warning",
    "Waiting",
    firebaseState.enabled
      ? "Realtime sync is connected. Waiting for the recipient."
      : "Realtime sync is not configured. Add Firebase config for cross-device updates."
  );
  if (existing) renderLocation(existing);

  if (firebaseState.enabled) {
    const pollRemoteLocation = async () => {
      try {
        const location = await readRemoteLocation(id);
        if (location) renderLocation(location);
      } catch (error) {
        setStatus("error", "Sync error", "Firebase is configured, but the database read failed. Check Realtime Database rules.");
        console.error("Firebase location read failed.", error);
      }
    };

    pollRemoteLocation();
    dashboardPollId = window.setInterval(pollRemoteLocation, 2500);
  }
}

function showReceiver(id) {
  document.body.classList.add("share-mode");
  els.consentScreen.hidden = false;
  els.consentText.textContent = activePhone
    ? `This request was sent to ${activePhone}. Your location is shared only after you approve the browser permission prompt.`
    : "Your location is shared only after you approve the browser permission prompt.";
  els.receiverCard.hidden = false;
  els.mapTitle.textContent = "Permission required";
  els.mapSummary.textContent = "Tap allow sharing, then approve the browser location prompt.";
  els.receiverText.textContent = activePhone
    ? `This request was sent to ${activePhone}. Share only if you trust the sender.`
    : "Share only if you trust the sender.";
  setStatus(
    "warning",
    "Permission needed",
    firebaseState.enabled
      ? "Realtime sync is connected. Tap allow, then approve the browser location prompt."
      : "Realtime sync is not configured on this deployed page."
  );

  const existing = readLocation(id);
  if (existing) renderLocation(existing);
}

function stopSharing() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  els.shareButton.hidden = false;
  els.stopButton.hidden = true;
  els.consentShareButton.hidden = false;
  els.consentStopButton.hidden = true;
  setStatus("warning", "Stopped", "Location sharing has been stopped on this device.");
}

function explainLocationError(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was blocked. Turn on location in phone settings and allow it for this browser.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Location is unavailable. Turn on GPS or location services, then try again.";
  }

  return "Location timed out. Move near a window or check location settings, then try again.";
}

function beginSharing(id) {
  if (!("geolocation" in navigator)) {
    setStatus("error", "Not supported", "This browser does not support location sharing.");
    return;
  }

  els.shareButton.hidden = true;
  els.stopButton.hidden = false;
  els.consentShareButton.hidden = true;
  els.consentStopButton.hidden = false;
  setStatus("warning", "Requesting", "Approve the browser location prompt to start sharing.");

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      await saveLocation(id, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now()
      });
      if (!firebaseState.enabled) return;
      els.consentStatus.textContent = "Location sharing is active and syncing. You can stop sharing at any time.";
    },
    (error) => {
      els.shareButton.hidden = false;
      els.stopButton.hidden = true;
      els.consentShareButton.hidden = false;
      els.consentStopButton.hidden = true;
      setStatus("error", "Permission issue", explainLocationError(error));
      els.mapTitle.textContent = "Location is not active";
      els.mapSummary.textContent = explainLocationError(error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 12000
    }
  );
}

function setupDefaultMessage() {
  els.messageInput.value =
    "Please share your live location with me. Open this secure permission link and allow location access only if you agree:";
}

els.inviteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const phoneNumber = `${els.countryCode.value}${cleanPhone(els.phoneInput.value)}`;

  if (phoneNumber.length < 8) {
    setStatus("error", "Check number", "Enter a valid mobile number before creating the invite.");
    return;
  }

  const sessionId = createSessionId();
  showInvite(sessionId, phoneNumber);
});

els.copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.inviteLink.value);
  els.copyButton.textContent = "Copied";
  setTimeout(() => {
    els.copyButton.textContent = "Copy";
  }, 1600);
});

els.shareButton.addEventListener("click", () => {
  if (activeSession) beginSharing(activeSession);
});

els.stopButton.addEventListener("click", stopSharing);

els.consentShareButton.addEventListener("click", () => {
  if (activeSession) beginSharing(activeSession);
});

els.consentStopButton.addEventListener("click", stopSharing);

window.addEventListener("storage", (event) => {
  if (!activeSession || event.key !== sessionKey(activeSession) || !event.newValue) return;
  renderLocation(JSON.parse(event.newValue));
});

window.addEventListener("hashchange", () => {
  if (dashboardPollId !== null) {
    window.clearInterval(dashboardPollId);
  }
  window.location.reload();
});

channel?.addEventListener("message", (event) => {
  if (event.data?.type === "location" && event.data.id === activeSession) {
    renderLocation(event.data.location);
  }
});

async function init() {
  setupDefaultMessage();
  initFirebase();

  if (activeMode === "dashboard" && activeSession) {
    startDashboard(activeSession);
  } else if (activeMode === "share" && activeSession) {
    showReceiver(activeSession);
  } else {
    setStatus("", "Ready", "Create a permission link by SMS.");
  }
}

init();
