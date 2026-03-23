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

const turfList = document.getElementById("turfList");
const addTurfForm = document.getElementById("addTurfForm");
const turfMessage = document.getElementById("turfMessage");
const slotTurfSelect = document.getElementById("slotTurfSelect");
const createSlotsBtn = document.getElementById("createSlotsBtn");
const slotAdminTable = document.getElementById("slotAdminTable");
const userList = document.getElementById("userList");

const DEFAULT_SLOTS = [
  "06:00 AM",
  "07:00 AM",
  "08:00 AM",
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "04:00 PM",
  "05:00 PM",
  "06:00 PM",
  "07:00 PM",
  "08:00 PM",
  "09:00 PM",
];

let turfs = [];

const renderTurfs = () => {
  turfList.innerHTML = "";
  turfs.forEach((turf) => {
    const card = document.createElement("div");
    card.className = "card p-4 flex items-center justify-between";
    card.innerHTML = `
      <div>
        <h3 class="text-xl">${turf.turf_name}</h3>
        <p class="muted text-sm">${turf.location}</p>
      </div>
      <button data-id="${turf.id}" class="btn-outline px-3 py-2 rounded-xl text-sm">Delete</button>
    `;
    turfList.appendChild(card);
  });

  slotTurfSelect.innerHTML = "";
  turfs.forEach((turf) => {
    const option = document.createElement("option");
    option.value = turf.id;
    option.textContent = turf.turf_name;
    slotTurfSelect.appendChild(option);
  });
};

const loadTurfs = async () => {
  const { data } = await axios.get(`${API}/turfs`);
  turfs = data;
  renderTurfs();
};

addTurfForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  turfMessage.textContent = "";
  const payload = {
    turf_name: addTurfForm.turf_name.value.trim(),
    location: addTurfForm.location.value.trim(),
    rating: parseFloat(addTurfForm.rating.value),
    price_per_hour: parseInt(addTurfForm.price_per_hour.value, 10),
    image_url: addTurfForm.image_url.value.trim(),
  };

  try {
    const { data } = await axios.post(`${API}/admin/add-turf`, payload);
    turfs = [data, ...turfs];
    renderTurfs();
    addTurfForm.reset();
    turfMessage.textContent = "Turf added.";
    turfMessage.className = "text-sm text-green-600";
  } catch (error) {
    turfMessage.textContent = "Failed to add turf.";
    turfMessage.className = "text-sm text-red-500";
  }
});

turfList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const turfId = parseInt(button.dataset.id, 10);

  try {
    await axios.delete(`${API}/admin/delete-turf`, { data: { turf_id: turfId } });
    turfs = turfs.filter((turf) => turf.id !== turfId);
    renderTurfs();
  } catch (error) {
    turfMessage.textContent = "Failed to delete turf.";
    turfMessage.className = "text-sm text-red-500";
  }
});

const loadSlotsForAdmin = async () => {
  const turfId = slotTurfSelect.value;
  if (!turfId) return;
  const { data } = await axios.get(`${API}/turf/${turfId}/slots`);

  slotAdminTable.innerHTML = `
    <table class="min-w-full text-sm">
      <thead>
        <tr class="text-left">
          <th class="py-2">Time Slot</th>
          <th>Status</th>
          <th>Update</th>
        </tr>
      </thead>
      <tbody>
        ${data.slots
      .map(
        (slot) => `
          <tr class="table-row">
            <td class="py-2">${slot.time_slot}</td>
            <td><span class="slot-status ${slot.availability_status === "AVAILABLE" ? "slot-available" : slot.availability_status === "BOOKED" ? "slot-booked" : "slot-unavailable"}">${slot.availability_status}</span></td>
            <td>
              <select data-slot="${slot.id}" class="bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-2 py-1">
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="BOOKED">BOOKED</option>
                <option value="UNAVAILABLE">UNAVAILABLE</option>
              </select>
            </td>
          </tr>
        `
      )
      .join("")}
      </tbody>
    </table>
  `;

  slotAdminTable.querySelectorAll("select[data-slot]").forEach((select) => {
    const slotId = select.dataset.slot;
    const slot = data.slots.find((s) => s.id === parseInt(slotId, 10));
    if (slot) select.value = slot.availability_status;
  });
};

slotTurfSelect.addEventListener("change", loadSlotsForAdmin);

createSlotsBtn.addEventListener("click", async () => {
  const turfId = slotTurfSelect.value;
  if (!turfId) return;
  await axios.post(`${API}/admin/create-slots`, { turf_id: turfId, slots: DEFAULT_SLOTS });
  loadSlotsForAdmin();
});

slotAdminTable.addEventListener("change", async (event) => {
  const select = event.target.closest("select[data-slot]");
  if (!select) return;
  const slotId = parseInt(select.dataset.slot, 10);
  await axios.post(`${API}/admin/slot-status`, { slot_id: slotId, status: select.value });
  loadSlotsForAdmin();
});

const loadUsers = async () => {
  const { data } = await axios.get(`${API}/admin/users`);
  userList.innerHTML = "";
  data.forEach((user) => {
    const card = document.createElement("div");
    card.className = "card p-4";
    card.innerHTML = `
      <h3 class="text-lg">${user.name}</h3>
      <p class="text-sm muted">${user.email}</p>
      <p class="text-sm muted">${user.phone_number}</p>
      <p class="text-sm muted">${user.location}</p>
    `;
    userList.appendChild(card);
  });
};

const initAdmin = async () => {
  await loadTurfs();
  await loadSlotsForAdmin();
  await loadUsers();
};

initAdmin().catch(() => {
  turfMessage.textContent = "Unable to load admin data.";
  turfMessage.className = "text-sm text-red-500";
});
