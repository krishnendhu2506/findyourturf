const API_BASE = (() => {
  const { protocol, hostname } = window.location;

  const getLocalApiPort = () => {
    const raw = localStorage.getItem("API_PORT");
    const port = Number.parseInt(raw || "", 10);
    if (Number.isFinite(port) && port > 0 && port < 65536) return String(port);
    return "5000";
  };

  // If running locally (file:// or localhost), point to the local Flask backend.
  if (protocol === "file:" || hostname === "" || hostname === "localhost" || hostname === "127.0.0.1") {
    return `http://127.0.0.1:${getLocalApiPort()}/api`;
  }
  // Production (e.g., deployed behind a reverse proxy)
  return "/api";
})();
window.API_BASE = API_BASE;

const storage = {
  setUser(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
  },
  getUser() {
    return JSON.parse(localStorage.getItem("currentUser") || "null");
  },
  clearUser() {
    localStorage.removeItem("currentUser");
  },
  setAdmin(admin) {
    localStorage.setItem("currentAdmin", JSON.stringify(admin));
  },
  getAdmin() {
    return JSON.parse(localStorage.getItem("currentAdmin") || "null");
  },
  clearAdmin() {
    localStorage.removeItem("currentAdmin");
  },
};

(() => {
  try {
    const admin = storage.getAdmin();
    if (typeof axios !== "undefined" && admin?.token) {
      axios.defaults.headers.common.Authorization = `Bearer ${admin.token}`;
    }
  } catch {
    // ignore
  }
})();

const requireUser = () => {
  const user = storage.getUser();
  if (!user) {
    window.location.href = "login.html";
  }
};

const requireAdmin = () => {
  const admin = storage.getAdmin();
  if (!admin || !admin.token) {
    window.location.href = "admin-login.html";
  }
};

const currentPage = window.location.pathname.split("/").pop();
if (["dashboard.html", "turf-details.html", "booking.html", "booking-request.html", "my-bookings.html", "booking-details.html", "refund-request.html"].includes(currentPage)) {
  requireUser();
}
if (["admin-dashboard.html"].includes(currentPage)) {
  requireAdmin();
}

const userLoginForm = document.getElementById("userLoginForm");
if (userLoginForm) {
  userLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("loginMessage");
    message.textContent = "";
    const payload = {
      email: userLoginForm.email.value.trim(),
      password: userLoginForm.password.value,
    };
    try {
      const { data } = await axios.post(`${API_BASE}/login`, payload);
      storage.setUser(data.user);
      window.location.href = "dashboard.html";
    } catch (error) {
      message.textContent = "Login failed. Check your credentials.";
      message.className = "text-sm text-red-500";
    }
  });
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("registerMessage");
    message.textContent = "";
    const payload = {
      name: registerForm.name.value.trim(),
      email: registerForm.email.value.trim(),
      password: registerForm.password.value,
      phone_number: registerForm.phone_number.value.trim(),
      location: registerForm.location.value.trim(),
    };
    try {
      const { data } = await axios.post(`${API_BASE}/register`, payload);
      storage.setUser(data.user);
      window.location.href = "dashboard.html";
    } catch (error) {
      const apiMessage = error?.response?.data?.error;
      const fields = error?.response?.data?.fields;
      if (apiMessage) {
        message.textContent = fields?.length
          ? `${apiMessage}: ${fields.join(", ")}`
          : apiMessage;
      } else {
        message.textContent = "Registration failed. Is the backend running?";
      }
      message.className = "text-sm text-red-500";
    }
  });
}

const adminLoginForm = document.getElementById("adminLoginForm");
if (adminLoginForm) {
  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("adminLoginMessage");
    message.textContent = "";
    const payload = {
      username: adminLoginForm.username.value.trim(),
      password: adminLoginForm.password.value,
    };
    try {
      const { data } = await axios.post(`${API_BASE}/admin-login`, payload);
      storage.setAdmin(data.admin);
      window.location.href = "admin-dashboard.html";
    } catch (error) {
      const status = error?.response?.status;
      const apiError = error?.response?.data?.error;
      if (!status) {
        message.textContent = `Admin login failed. Backend not reachable at ${API_BASE}.`;
      } else if (apiError) {
        message.textContent = `Admin login failed (${status}): ${apiError}`;
      } else {
        message.textContent = `Admin login failed (${status}).`;
      }
      message.className = "text-sm text-red-500";
    }
  });
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    storage.clearUser();
    window.location.href = "login.html";
  });
}

const adminLogout = document.getElementById("adminLogout");
if (adminLogout) {
  adminLogout.addEventListener("click", () => {
    storage.clearAdmin();
    window.location.href = "admin-login.html";
  });
}
