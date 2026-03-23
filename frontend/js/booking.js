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

const turfInfo = document.getElementById("turfInfo");
const slotTable = document.getElementById("slotTable");
const bookingDate = document.getElementById("bookingDate");
const slotMessage = document.getElementById("slotMessage");

const getTurfId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
};

const setMinDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  bookingDate.min = `${year}-${month}-${day}`;
  bookingDate.value = `${year}-${month}-${day}`;
};

const renderTurf = (turf) => {
  turfInfo.innerHTML = `
    <img src="${turf.image_url}" alt="${turf.turf_name}" class="w-full md:w-72 rounded-2xl object-cover" />
    <div class="space-y-2">
      <h1 class="text-4xl">${turf.turf_name}</h1>
      <p class="muted"><i class="fa-solid fa-location-dot"></i> ${turf.location}</p>
      <p class="text-slate-700"><i class="fa-solid fa-star"></i> ${turf.rating.toFixed(1)} rating</p>
      <p class="text-slate-700"><i class="fa-solid fa-indian-rupee-sign"></i> ${turf.price_per_hour} / hour</p>
      <a href="${turf.maps_link}" target="_blank" rel="noopener" class="btn-outline inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
        <i class="fa-solid fa-location-dot"></i> Open Location
      </a>
    </div>
  `;
};

const statusClass = (status) => {
  if (status === "AVAILABLE") return "slot-available";
  if (status === "BOOKED") return "slot-booked";
  return "slot-unavailable";
};

const renderSlots = (slots) => {
  slotTable.innerHTML = "";
  const turfId = getTurfId();
  const date = bookingDate.value;
  slots.forEach((slot) => {
    const row = document.createElement("tr");
    row.className = "table-row";
    const action = slot.availability_status === "AVAILABLE"
      ? `<a href="booking-request.html?id=${encodeURIComponent(turfId)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(slot.time_slot)}" class="btn-primary inline-flex items-center justify-center px-3 py-1 rounded-lg text-xs">Book</a>`
      : `<span class="text-xs muted">${slot.availability_status === "BOOKED" ? "BOOKED" : "UNAVAILABLE"}</span>`;

    row.innerHTML = `
      <td class="py-3">${slot.time_slot}</td>
      <td><span class="slot-status ${statusClass(slot.availability_status)}">${slot.availability_status}</span></td>
      <td>${action}</td>
    `;
    slotTable.appendChild(row);
  });
};

const loadSlots = async () => {
  const turfId = getTurfId();
  if (!turfId) {
    turfInfo.innerHTML = "<p class=\"text-red-500\">No turf selected. Please go back and choose a turf.</p>";
    slotTable.innerHTML = "";
    return;
  }

  const date = bookingDate.value;
  try {
    const { data } = await axios.get(`${API}/turf/${turfId}/slots${date ? `?date=${date}` : ''}`);
    renderTurf(data.turf);
    renderSlots(data.slots);
  } catch (error) {
    const errMsg =
      error.response?.data?.error || error.message || "Unable to load turf details.";

    console.error("Failed to load slots", {
      turfId,
      date,
      apiBase: API,
      error,
    });

    turfInfo.innerHTML = `<p class=\"text-red-500\">${errMsg}</p>`;
    slotTable.innerHTML = "";
  }
};

bookingDate.addEventListener("change", loadSlots);

setMinDate();
loadSlots();
