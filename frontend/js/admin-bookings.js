window.__adminBookingsLoaded = "loading";

const resolveApiBase = () => {
  if (typeof API_BASE !== "undefined") {
    if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && API_BASE === "/api") {
      return "http://127.0.0.1:5000/api";
    }
    return API_BASE;
  }
  if (
    location.protocol === "file:" ||
    location.hostname === "" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  ) {
    return "http://127.0.0.1:5000/api";
  }
  return "/api";
};

const API = resolveApiBase();
const apiOrigin = API.replace(/\/api\/?$/i, "");

const normalizeStatus = (value) => (value || "").toString().trim().toLowerCase();

const statusBadgeClass = (status) => {
  const s = normalizeStatus(status);
  if (s === "confirmed" || s === "booked") return "status-confirmed";
  if (s === "rejected") return "status-rejected";
  if (s === "cancelled" || s === "canceled") return "status-cancelled";
  return "status-pending";
};

const statusLabel = (status) => {
  const s = normalizeStatus(status);
  if (!s) return "pending";
  if (s === "booked") return "confirmed";
  return s;
};

const toMediaUrl = (path) => {
  if (!path) return "";
  const raw = path.toString().trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/uploads/")) return `${apiOrigin}${raw}`;
  if (raw.startsWith("uploads/")) return `${apiOrigin}/${raw}`;
  return raw;
};

const bookingTableBody = document.getElementById("bookingRequestsTable");
const bookingMessage = document.getElementById("bookingRequestsMessage");
const refundList = document.getElementById("refundList");

if (bookingMessage) {
  bookingMessage.textContent = "Loading booking requests...";
  bookingMessage.className = "text-sm muted";
}

window.__adminBookingsLoaded = true;

const ensureDetailsModal = () => {
  if (document.getElementById("bookingDetailsModal")) return;

  const modal = document.createElement("div");
  modal.id = "bookingDetailsModal";
  modal.className = "modal-backdrop hidden";
  modal.innerHTML = `
    <div class="modal-card">
      <div class="flex items-center justify-between gap-4">
        <h3 class="text-2xl">Booking Details</h3>
        <button id="bookingDetailsClose" class="btn-outline px-3 py-1 rounded-xl text-xs">Close</button>
      </div>
      <div id="bookingDetailsBody" class="mt-4 grid md:grid-cols-2 gap-4 text-sm"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  modal.querySelector("#bookingDetailsClose").addEventListener("click", close);
};

const openDetailsModal = (booking) => {
  ensureDetailsModal();
  const modal = document.getElementById("bookingDetailsModal");
  const body = document.getElementById("bookingDetailsBody");
  if (!modal || !body) return;

  const screenshotUrl = toMediaUrl(booking.payment_screenshot);
  const screenshotBtn = screenshotUrl
    ? `<button class="btn-outline px-3 py-2 rounded-xl text-xs" data-preview-src="${screenshotUrl}">Preview Screenshot</button>`
    : `<span class="text-xs muted">No screenshot</span>`;

  const price = booking.turf?.price_per_hour != null ? `₹ ${booking.turf.price_per_hour} / hour` : "-";
  const notes = (booking.special_notes || "").toString().trim() || "-";

  body.innerHTML = `
    <div class="card p-4 space-y-1">
      <div class="muted text-xs">User</div>
      <div class="text-slate-200 font-semibold">${booking.user?.name || "-"}</div>
      <div class="muted">${booking.user?.email || "-"}</div>
      <div class="muted">${booking.user?.phone_number || "-"}</div>
    </div>
    <div class="card p-4 space-y-1">
      <div class="muted text-xs">Turf</div>
      <div class="text-slate-200 font-semibold">${booking.turf?.turf_name || "-"}</div>
      <div class="muted">${booking.turf?.location || "-"}</div>
      <div class="muted">Price: ${price}</div>
    </div>
    <div class="card p-4 space-y-1">
      <div class="muted text-xs">Slot</div>
      <div class="text-slate-200 font-semibold">${booking.date || "-"} • ${booking.time_slot || "-"}</div>
      <div class="muted">Players: ${booking.players_count ?? "-"}</div>
      <div class="muted">Status: ${statusLabel(booking.status)}</div>
    </div>
    <div class="card p-4 space-y-2">
      <div class="muted text-xs">Payment</div>
      <div>${screenshotBtn}</div>
      <div class="muted text-xs mt-2">User Notes</div>
      <div class="text-slate-200">${notes}</div>
    </div>
  `;

  body.querySelectorAll("[data-preview-src]").forEach((btn) => {
    btn.addEventListener("click", () => window.openImagePreview(btn.dataset.previewSrc));
  });

  modal.classList.remove("hidden");
};

const renderBookingError = (text) => {
  if (bookingTableBody) bookingTableBody.innerHTML = "";
  if (bookingMessage) {
    bookingMessage.textContent = text;
    bookingMessage.className = "text-sm text-rose-600";
  }
};

const renderRefundError = (text) => {
  if (!refundList) return;
  refundList.innerHTML = `<div class="rounded-2xl p-4 border border-rose-200 bg-rose-50 text-sm text-rose-700">${text}</div>`;
};

const renderBookings = (bookings) => {
  if (!bookingTableBody) return;
  bookingTableBody.innerHTML = "";
  if (bookingMessage) {
    if (!bookings?.length) {
      bookingMessage.textContent = "No booking requests yet.";
      bookingMessage.className = "text-sm muted";
    } else {
      bookingMessage.textContent = "";
    }
  }

  bookings.forEach((booking) => {
    const status = statusLabel(booking.status);
    const screenshotUrl = toMediaUrl(booking.payment_screenshot);

    const tr = document.createElement("tr");
    tr.className = "table-row";

    const screenshotCell = screenshotUrl
      ? `<button data-preview-src="${screenshotUrl}" class="btn-outline px-3 py-1 rounded-lg text-xs">View</button>`
      : `<span class="text-xs muted">-</span>`;

    const actions =
      status === "pending"
        ? `
          <div class="flex flex-wrap gap-2">
            <button data-action="details" data-booking="${booking.id}" class="btn-outline px-3 py-1 rounded-lg text-xs">Details</button>
            <button data-action="confirm" data-booking="${booking.id}" class="btn-primary px-3 py-1 rounded-lg text-xs">Confirm</button>
            <button data-action="reject" data-booking="${booking.id}" class="btn-outline px-3 py-1 rounded-lg text-xs">Reject</button>
          </div>
        `
        : `
          <div class="flex flex-wrap gap-2">
            <button data-action="details" data-booking="${booking.id}" class="btn-outline px-3 py-1 rounded-lg text-xs">Details</button>
          </div>
        `;

    tr.innerHTML = `
      <td class="py-3">${booking.user?.name || "User"}</td>
      <td>${booking.turf?.turf_name || "Turf"}</td>
      <td>${booking.date || "-"}</td>
      <td>${booking.time_slot || "-"}</td>
      <td>${screenshotCell}</td>
      <td><span class="status-badge ${statusBadgeClass(booking.status)}">${status}</span></td>
      <td>${actions}</td>
    `;

    bookingTableBody.appendChild(tr);
  });
};

const loadBookings = async () => {
  if (!bookingTableBody) return;
  try {
    const { data } = await axios.get(`${API}/admin/bookings`);
    window.__adminBookingsCache = Array.isArray(data) ? data : [];
    renderBookings(window.__adminBookingsCache);
  } catch {
    renderBookingError("Unable to load bookings. Make sure you are logged in as admin and the backend is running.");
  }
};

const renderRefunds = (refunds) => {
  if (!refundList) return;
  refundList.innerHTML = "";

  refunds.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card p-4 booking-card";
    const status = statusLabel(r.status);
    const booking = r.booking || {};
    const actions =
      status === "pending"
        ? `
          <button data-refund="${r.id}" data-action="approved" class="btn-primary px-3 py-2 rounded-xl text-sm">Approve</button>
          <button data-refund="${r.id}" data-action="rejected" class="btn-outline px-3 py-2 rounded-xl text-sm">Reject</button>
        `
        : `<span class="text-sm muted">No actions</span>`;

    card.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div class="flex items-center gap-3">
            <h3 class="text-xl">Refund for #${r.booking_id}</h3>
            <span class="status-badge ${statusBadgeClass(r.status)}">${status}</span>
          </div>
          <p class="text-sm muted mt-1">${r.user?.name || "User"} • ${r.user?.phone_number || ""} • ${r.user?.email || ""}</p>
          <p class="text-sm muted mt-1">${booking.turf?.turf_name || ""} • ${booking.date || ""} • ${booking.time_slot || ""}</p>
          <p class="text-sm mt-2 text-slate-200">${r.reason}</p>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          ${actions}
        </div>
      </div>
    `;
    refundList.appendChild(card);
  });
};

const loadRefunds = async () => {
  if (!refundList) return;
  try {
    const { data } = await axios.get(`${API}/admin/refunds`);
    renderRefunds(data);
  } catch {
    renderRefundError("Unable to load refunds. Make sure you are logged in as admin and the backend is running.");
  }
};

if (bookingTableBody) {
  bookingTableBody.addEventListener("click", async (event) => {
    const preview = event.target.closest("[data-preview-src]");
    if (preview) {
      window.openImagePreview(preview.dataset.previewSrc);
      return;
    }

    const button = event.target.closest("button[data-booking][data-action]");
    if (!button) return;

    const bookingId = parseInt(button.dataset.booking, 10);
    const action = button.dataset.action;

    if (action === "details") {
      const bookings = window.__adminBookingsCache || [];
      const booking = bookings.find((b) => Number(b.id) === bookingId);
      if (booking) openDetailsModal(booking);
      return;
    }

    if (action === "confirm") {
      await axios.post(`${API}/admin/confirm-booking`, { booking_id: bookingId });
    } else if (action === "reject") {
      await axios.post(`${API}/admin/reject-booking`, { booking_id: bookingId });
    }
    await loadBookings();
  });
}

if (refundList) {
  refundList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-refund][data-action]");
    if (!button) return;
    const refundId = parseInt(button.dataset.refund, 10);
    const action = button.dataset.action;
    await axios.post(`${API}/admin/refund-action`, { refund_request_id: refundId, action });
    await loadRefunds();
  });
}

const initAdminBookings = async () => {
  await loadBookings();
  await loadRefunds();

  window.setInterval(() => {
    loadBookings();
    loadRefunds();
  }, 10000);
};

initAdminBookings().catch(() => {
  // admin.js handles top-level error messages; keep quiet here.
});
