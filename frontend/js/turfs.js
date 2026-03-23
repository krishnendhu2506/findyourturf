const turfGrid = document.querySelector("#turfGrid");
const searchInput = document.querySelector("#searchInput");
const adminForm = document.querySelector("#adminForm");
const adminMessage = document.querySelector("#adminMessage");

let allTurfs = [];

const renderTurfs = (turfs) => {
  turfGrid.innerHTML = "";
  if (!turfs.length) {
    turfGrid.innerHTML = "<div class=\"text-slate-400\">No turfs match your search.</div>";
    return;
  }

  turfs.forEach((turf, index) => {
    const card = document.createElement("div");
    card.className = "turf-card rounded-2xl p-6 flex flex-col justify-between";
    card.style.animationDelay = `${index * 0.04}s`;
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold text-white">${turf.turf_name}</h3>
          <span class="badge text-xs px-3 py-1 rounded-full">${turf.sport_type}</span>
        </div>
        <p class="text-sm text-slate-400 mt-2">${turf.location}</p>
        <div class="mt-4 flex items-center gap-3 text-sm">
          <span class="text-emerald-400">Rating ${turf.rating.toFixed(1)}</span>
          <span class="text-slate-500">|</span>
          <span class="text-slate-200">INR ${turf.price_per_hour}/hr</span>
        </div>
      </div>
      <div class="mt-6">
        <a href="turf-details.html?id=${turf.id}" class="neon-btn w-full text-center py-3 rounded-xl inline-block">View Slots</a>
        <a href="${turf.maps_link}" target="_blank" rel="noopener" class="mt-3 w-full text-center py-3 rounded-xl inline-block border border-emerald-400 text-emerald-300">Open Location</a>
      </div>
    `;
    turfGrid.appendChild(card);
  });
};

const fetchTurfs = async () => {
  const { data } = await axios.get(`${APP_CONFIG.API_BASE}/turfs`);
  allTurfs = data;
  renderTurfs(allTurfs);
};

const handleSearch = () => {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allTurfs.filter((turf) =>
    turf.turf_name.toLowerCase().includes(query) ||
    turf.location.toLowerCase().includes(query)
  );
  renderTurfs(filtered);
};

searchInput.addEventListener("input", handleSearch);

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminMessage.textContent = "";

  const payload = {
    turf_name: adminForm.turf_name.value.trim(),
    location: adminForm.location.value.trim(),
    sport_type: adminForm.sport_type.value.trim(),
    rating: parseFloat(adminForm.rating.value),
    price_per_hour: parseInt(adminForm.price_per_hour.value, 10),
  };

  try {
    const { data } = await axios.post(`${APP_CONFIG.API_BASE}/turfs`, payload);
    allTurfs = [data, ...allTurfs];
    renderTurfs(allTurfs);
    adminForm.reset();
    adminMessage.textContent = "Turf added successfully.";
    adminMessage.className = "text-emerald-400 text-sm";
  } catch (error) {
    adminMessage.textContent = "Failed to add turf. Check inputs.";
    adminMessage.className = "text-red-400 text-sm";
  }
});

fetchTurfs().catch(() => {
  turfGrid.innerHTML = "<div class=\"text-red-400\">Unable to load turfs. Start the backend server.</div>";
});
