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

const toMediaUrl = (path) => {
  if (!path) return "";
  const raw = path.toString().trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/uploads/")) return `${apiOrigin}${raw}`;
  if (raw.startsWith("uploads/")) return `${apiOrigin}/${raw}`;
  return raw;
};

const ADMIN_CONTACT = "+91 98765 43210";

const qp = (key) => new URLSearchParams(window.location.search).get(key);

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

const parseSlotDateTime = (dateStr, timeSlot) => {
  // dateStr: YYYY-MM-DD, timeSlot: 07:00 AM
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  const [time, meridian] = timeSlot.split(" ");
  let [hh, mm] = time.split(":").map((v) => parseInt(v, 10));
  const isPm = meridian?.toUpperCase() === "PM";
  if (isPm && hh !== 12) hh += 12;
  if (!isPm && hh === 12) hh = 0;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};

const buildWeatherLink = ({ location, date, time }) => {
  const parts = ["weather", location, date, time].filter(Boolean);
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
};

const canRequestRefundNow = (booking) => {
  const status = normalizeStatus(booking?.status);
  if (status !== "cancelled" && status !== "canceled") return false;
  const slotDt = parseSlotDateTime(booking.date, booking.time_slot);
  return Date.now() <= slotDt.getTime() - 3 * 60 * 60 * 1000;
};

const initBookingRequestPage = async () => {
  const form = document.getElementById("bookingRequestForm");
  if (!form) return;

  const adminContact = document.getElementById("adminContact");
  if (adminContact) adminContact.textContent = ADMIN_CONTACT;

  const message = document.getElementById("bookingRequestMessage");
  const summary = document.getElementById("bookingSummary");
  const checkWeatherBtn = document.getElementById("checkWeatherBtn");
  const weatherResult = document.getElementById("weatherResult");
  const turfId = qp("id");
  const date = qp("date");
  const time = qp("time");

  const currentUser = storage.getUser();
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("turfId").value = turfId || "";
  document.getElementById("bookingDate").value = date || "";
  document.getElementById("timeSlot").value = time || "";

  const userNameInput = document.getElementById("userNameInput");
  const userPhoneInput = document.getElementById("userPhoneInput");
  if (userNameInput) userNameInput.value = currentUser.name || "";
  if (userPhoneInput) userPhoneInput.value = currentUser.phone_number || "";

  let turfLocation = "";

  try {
    const { data } = await axios.get(`${API}/turf/${encodeURIComponent(turfId)}/slots?date=${encodeURIComponent(date)}`);
    const turf = data.turf;
    const price = turf.price_per_hour;
    turfLocation = turf.location || "";
    summary.innerHTML = `
      <div><span class="muted">Turf:</span> <span class="text-slate-200 font-semibold">${turf.turf_name}</span></div>
      <div><span class="muted">Location:</span> <span class="text-slate-200">${turf.location}</span></div>
      <div><span class="muted">Date:</span> <span class="text-slate-200">${date}</span></div>
      <div><span class="muted">Time:</span> <span class="text-slate-200">${time}</span></div>
      <div><span class="muted">Price:</span> <span class="text-slate-200 font-semibold">₹ ${price} / hour</span></div>
    `;
  } catch (e) {
    summary.innerHTML = `<p class="text-red-400">Unable to load booking summary.</p>`;
  }

  if (checkWeatherBtn && weatherResult) {
    checkWeatherBtn.addEventListener("click", async () => {
      weatherResult.classList.remove("hidden");
      weatherResult.innerHTML = `
        <div class="rounded-2xl p-4 border border-slate-200 bg-white">
          <div class="text-sm muted">Checking weather...</div>
        </div>
      `;

      if (!turfLocation) {
        weatherResult.innerHTML = `<div class="rounded-2xl p-4 border border-rose-200 bg-rose-50 text-sm text-rose-700">Missing turf location.</div>`;
        return;
      }
      if (!date || !time) {
        weatherResult.innerHTML = `<div class="rounded-2xl p-4 border border-rose-200 bg-rose-50 text-sm text-rose-700">Missing slot date/time.</div>`;
        return;
      }

      const link = buildWeatherLink({ location: turfLocation, date, time });
      weatherResult.innerHTML = `
        <div class="rounded-2xl p-4 border border-emerald-200 bg-emerald-50">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-slate-800">Weather forecast</div>
              <div class="text-xs text-slate-600">${turfLocation} • ${date} • ${time}</div>
            </div>
            <a href="${link}" target="_blank" rel="noopener" class="btn-primary px-4 py-2 rounded-xl text-sm inline-flex items-center gap-2">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
              Open
            </a>
          </div>
          <div class="mt-3 text-sm text-slate-700">Opens in a new tab.</div>
        </div>
      `;
      window.open(link, "_blank", "noopener");
      return;

      /* Weather API integration disabled (external redirect instead).
      checkWeatherBtn.disabled = true;
      checkWeatherBtn.classList.add("opacity-60", "cursor-not-allowed");
      try {
        const { data } = await axios.get(
          `${API}/weather?location=${encodeURIComponent(turfLocation)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`
        );

        lastWeatherStatus = normalizeStatus(data.status) || null;
        const icon = weatherIconClass(data.condition_main || data.condition);
        const cardCls = weatherCardClass(data.status);
        const pill = weatherStatusPill(data.status);
        const temp = typeof data.temperature === "number" ? `${data.temperature}°C` : "-";
        const wind = typeof data.wind_speed === "number" ? `${data.wind_speed} m/s` : "-";

        weatherResult.innerHTML = `
          <div class="rounded-2xl p-4 ${cardCls}">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                  <i class="fa-solid ${icon}"></i>
                </div>
                <div>
                  <div class="text-sm font-semibold text-slate-800">Weather for your slot</div>
                  <div class="text-xs text-slate-500">${data.location || turfLocation}${data.matched_time ? ` • ${data.matched_time}` : ""}</div>
                </div>
              </div>
              <div>${pill}</div>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div class="bg-white/70 rounded-xl p-3 border border-slate-200">
                <div class="text-xs text-slate-500">Temperature</div>
                <div class="text-slate-800 font-semibold">${temp}</div>
              </div>
              <div class="bg-white/70 rounded-xl p-3 border border-slate-200">
                <div class="text-xs text-slate-500">Condition</div>
                <div class="text-slate-800 font-semibold">${data.condition || "-"}</div>
              </div>
              <div class="bg-white/70 rounded-xl p-3 border border-slate-200 col-span-2">
                <div class="text-xs text-slate-500">Wind</div>
                <div class="text-slate-800 font-semibold">${wind}</div>
              </div>
            </div>

            <div class="mt-3 text-sm ${lastWeatherStatus === "safe" ? "text-emerald-700" : lastWeatherStatus === "risky" ? "text-rose-700" : "text-slate-700"}">
              ${data.message || ""}
            </div>
          </div>
        `;
      } catch (error) {
        const err =
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Unable to fetch weather. Please try again.";
        weatherResult.innerHTML = `<div class="rounded-2xl p-4 border border-rose-200 bg-rose-50 text-sm text-rose-700">${err}</div>`;
      } finally {
        checkWeatherBtn.disabled = false;
        checkWeatherBtn.classList.remove("opacity-60", "cursor-not-allowed");
      }
      */
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";

    const fd = new FormData(form);
    fd.append("user_id", currentUser.id);
    fd.set("turf_id", turfId || fd.get("turf_id"));
    fd.set("date", date || fd.get("date"));
    fd.set("time_slot", time || fd.get("time_slot"));

    try {
      const { data } = await axios.post(`${API}/booking-request`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      message.textContent = data?.message || "Booking request submitted. Waiting for admin confirmation.";
      message.className = "text-sm text-green-400";
      window.location.href = `booking-details.html?id=${data.booking.id}`;
    } catch (error) {
      const err = error?.response?.data?.error || "Failed to submit request.";
      message.textContent = err;
      message.className = "text-sm text-red-400";
    }
  });
};

const initMyBookingsPage = async () => {
  const table = document.getElementById("myBookingsTable");
  if (!table) return;

  const message = document.getElementById("myBookingsMessage");
  const currentUser = storage.getUser();
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  const load = async () => {
    try {
      const { data } = await axios.get(`${API}/my-bookings?user_id=${encodeURIComponent(currentUser.id)}`);
      table.innerHTML = "";
      if (!data.length) {
        message.textContent = "No bookings yet.";
        message.className = "text-sm muted";
        return;
      }
      data.forEach((b) => {
        const tr = document.createElement("tr");
        tr.className = "table-row";
        const adminMsg = (b.admin_message || "").toString().trim();
        const msgCell = adminMsg
          ? `<span title="${adminMsg.replace(/\"/g, "&quot;")}">${adminMsg.length > 45 ? `${adminMsg.slice(0, 45)}...` : adminMsg}</span>`
          : `<span class="muted">-</span>`;

        tr.innerHTML = `
          <td class="py-3">${b.turf?.turf_name || "Turf"}</td>
          <td>${b.date}</td>
          <td>${b.time_slot}</td>
          <td>${b.players_count ?? "-"}</td>
          <td><span class="status-badge ${statusBadgeClass(b.status)}">${statusLabel(b.status)}</span></td>
          <td>${msgCell}</td>
          <td><a class="btn-outline px-3 py-1 rounded-lg text-xs" href="booking-details.html?id=${b.id}">View</a></td>
        `;
        table.appendChild(tr);
      });
      message.textContent = "";
    } catch (e) {
      message.textContent = "Unable to load bookings. Start the backend server.";
      message.className = "text-sm text-red-400";
    }
  };

  await load();
  window.setInterval(load, 10000);
};

const initBookingDetailsPage = async () => {
  const container = document.getElementById("bookingDetailsCard");
  if (!container) return;

  const badge = document.getElementById("bookingStatusBadge");
  const message = document.getElementById("bookingDetailsMessage");
  const refundBtn = document.getElementById("refundRequestBtn");
  const refundMessage = document.getElementById("refundMessage");

  const currentUser = storage.getUser();
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  const bookingId = qp("id");
  if (!bookingId) {
    message.textContent = "Missing booking id.";
    message.className = "text-sm text-red-400";
    return;
  }

  try {
    const { data } = await axios.get(`${API}/booking/${encodeURIComponent(bookingId)}`);
    const status = statusLabel(data.status);

    if (badge) {
      badge.className = `status-badge ${statusBadgeClass(data.status)} self-start`;
      badge.textContent = status;
    }

    const screenshotUrl = toMediaUrl(data.payment_screenshot);
    const screenshot = screenshotUrl
      ? `<button class="btn-outline px-4 py-2 rounded-xl text-sm" data-preview-src="${screenshotUrl}">Preview Screenshot</button>`
      : `<span class="muted text-sm">No screenshot</span>`;

    container.innerHTML = `
      <div class="card p-5 space-y-2">
        <div class="text-sm muted">Booking ID</div>
        <div class="text-slate-200 font-semibold">#${data.id}</div>
        <div class="text-sm muted mt-3">Turf</div>
        <div class="text-slate-200 font-semibold">${data.turf?.turf_name || "Turf"}</div>
        <div class="muted text-sm">${data.turf?.location || ""}</div>
      </div>
      <div class="card p-5 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm muted">Date</div>
            <div class="text-slate-200 font-semibold">${data.date}</div>
          </div>
          <div>
            <div class="text-sm muted">Time Slot</div>
            <div class="text-slate-200 font-semibold">${data.time_slot}</div>
          </div>
        </div>
        <div class="text-sm muted mt-3">Players</div>
        <div class="text-slate-200 font-semibold">${data.players_count ?? "-"}</div>
        <div class="text-sm muted mt-3">Payment Screenshot</div>
        <div>${screenshot}</div>
        <div class="text-sm muted mt-3">Admin Message</div>
        <div class="text-slate-200">${(data.admin_message || "No message yet.").toString()}</div>
      </div>
    `;

    container.querySelectorAll("[data-preview-src]").forEach((btn) => {
      btn.addEventListener("click", () => window.openImagePreview(btn.dataset.previewSrc));
    });

    if (refundBtn) {
      if (canRequestRefundNow(data)) {
        refundBtn.classList.remove("hidden");
        refundBtn.href = `refund-request.html?booking_id=${encodeURIComponent(data.id)}`;
        refundMessage.textContent = "";
      } else {
        refundBtn.classList.add("hidden");
        refundMessage.textContent = "Refund request available only for cancelled bookings, at least 3 hours before slot time.";
        refundMessage.className = "text-sm muted";
      }
    }
  } catch (e) {
    message.textContent = "Unable to load booking details.";
    message.className = "text-sm text-red-400";
  }
};

const initRefundRequestPage = async () => {
  const form = document.getElementById("refundRequestForm");
  if (!form) return;

  const summary = document.getElementById("refundBookingSummary");
  const message = document.getElementById("refundRequestMessage");
  const currentUser = storage.getUser();
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  const bookingId = qp("booking_id");
  if (!bookingId) {
    summary.innerHTML = `<p class="text-red-400">Missing booking id.</p>`;
    return;
  }

  try {
    const { data } = await axios.get(`${API}/booking/${encodeURIComponent(bookingId)}`);
    summary.innerHTML = `
      <div><span class="muted">Booking:</span> <span class="text-slate-200 font-semibold">#${data.id}</span></div>
      <div><span class="muted">Turf:</span> <span class="text-slate-200">${data.turf?.turf_name || "Turf"}</span></div>
      <div><span class="muted">Date:</span> <span class="text-slate-200">${data.date}</span></div>
      <div><span class="muted">Time:</span> <span class="text-slate-200">${data.time_slot}</span></div>
      <div><span class="muted">Status:</span> <span class="text-slate-200">${statusLabel(data.status)}</span></div>
    `;
  } catch (e) {
    summary.innerHTML = `<p class="text-red-400">Unable to load booking.</p>`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";

    const fd = new FormData(form);
    const reason = (fd.get("reason") || "").toString();

    try {
      await axios.post(`${API}/refund-request`, {
        booking_id: parseInt(bookingId, 10),
        user_id: currentUser.id,
        reason,
      });
      message.textContent = "Refund request submitted.";
      message.className = "text-sm text-green-400";
      window.location.href = `booking-details.html?id=${encodeURIComponent(bookingId)}`;
    } catch (error) {
      const err = error?.response?.data?.error || "Failed to submit refund request.";
      message.textContent = err;
      message.className = "text-sm text-red-400";
    }
  });
};

initBookingRequestPage();
initMyBookingsPage();
initBookingDetailsPage();
initRefundRequestPage();
