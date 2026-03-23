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

const turfGrid = document.getElementById("turfGrid");
const searchInput = document.getElementById("searchInput");
const userName = document.getElementById("userName");

let turfs = [];

const renderTurfs = (items) => {
  turfGrid.innerHTML = "";
  items.forEach((turf, index) => {
    const card = document.createElement("div");
    card.className = "card card-animate overflow-hidden";
    card.style.animationDelay = `${index * 0.05}s`;
    card.innerHTML = `
      <img src="${turf.image_url}" alt="${turf.turf_name}" class="h-40 w-full object-cover" />
      <div class="p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-2xl">${turf.turf_name}</h3>
          <span class="icon-badge"><i class="fa-solid fa-star"></i> ${turf.rating.toFixed(1)}</span>
        </div>
        <div class="text-sm muted flex items-center gap-2"><i class="fa-solid fa-location-dot"></i> ${turf.location}</div>
        <div class="text-sm text-slate-700 flex items-center gap-2"><i class="fa-solid fa-indian-rupee-sign"></i> ${turf.price_per_hour}/hr</div>
        <div class="flex flex-wrap gap-3">
          <a href="turf-details.html?id=${turf.id}" class="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm">View Slots <i class="fa-solid fa-arrow-right"></i></a>
          <a href="turf-details.html?id=${turf.id}" class="btn-outline inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm">Book Slot</a>
          <a href="${turf.maps_link}" target="_blank" rel="noopener" class="btn-outline inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
            <i class="fa-solid fa-location-dot"></i> Open Location
          </a>
        </div>
      </div>
    `;
    turfGrid.appendChild(card);
  });
};

const fetchTurfs = async () => {
  const { data } = await axios.get(`${API}/turfs`);
  turfs = data;
  renderTurfs(turfs);
};

const filterTurfs = () => {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = turfs.filter((turf) =>
    turf.turf_name.toLowerCase().includes(query) ||
    turf.location.toLowerCase().includes(query)
  );
  renderTurfs(filtered);
};

searchInput.addEventListener("input", filterTurfs);

const currentUser = storage.getUser();
if (currentUser && userName) {
  userName.textContent = `Hi, ${currentUser.name}`;
}

fetchTurfs().catch(() => {
  turfGrid.innerHTML = "<p class=\"text-red-500\">Unable to load turfs. Start the backend server.</p>";
});
