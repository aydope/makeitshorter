class TokenManager {
  constructor() {
    this.refreshPromise = null;
    this.isRefreshing = false;
    this.refreshTimer = null;
    this.checkInterval = 14 * 60 * 1000;
    this.tokenExpiresAt = null;
    this.pendingRequests = [];
    this.bindVisibilityListeners();
  }

  bindVisibilityListeners() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.refreshAccessToken().catch(() => {});
      }
    });

    window.addEventListener("focus", () => {
      this.refreshAccessToken().catch(() => {});
    });

    window.addEventListener("online", () => {
      this.refreshAccessToken().catch(() => {});
    });

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        this.refreshAccessToken().catch(() => {});
      }
    });
  }

  decodeTokenExpiry(accessToken) {
    try {
      const payload = accessToken.split(".")[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.exp ? new Date(decoded.exp * 1000).getTime() : null;
    } catch {
      return null;
    }
  }

  isTokenExpiringSoon() {
    if (!this.tokenExpiresAt) return true;
    const timeUntilExpiry = this.tokenExpiresAt - Date.now();
    return timeUntilExpiry < 60 * 1000;
  }

  async refreshAccessToken() {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.isTokenExpiringSoon()) {
      return true;
    }

    this.isRefreshing = true;
    this.refreshPromise = this._performRefresh();

    try {
      const result = await this.refreshPromise;
      this.isRefreshing = false;
      this.refreshPromise = null;
      this.processQueue(result);
      return result;
    } catch (error) {
      this.isRefreshing = false;
      this.refreshPromise = null;
      this.rejectQueue(error);
      throw error;
    }
  }

  async _performRefresh() {
    const response = await fetch("/api/auth/refresh-token", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to refresh token");
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || "Refresh failed");
    }

    if (data.accessToken) {
      const expiryTime = this.decodeTokenExpiry(data.accessToken);
      if (expiryTime) {
        this.tokenExpiresAt = expiryTime;
      }
    }

    return true;
  }

  enqueue(callback) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.push({
        callback,
        resolve,
        reject,
      });
    });
  }

  processQueue(result) {
    const requests = this.pendingRequests.splice(0);
    requests.forEach((req) => {
      try {
        const callbackResult = req.callback();
        req.resolve(callbackResult || result);
      } catch (error) {
        req.reject(error);
      }
    });
  }

  rejectQueue(error) {
    const requests = this.pendingRequests.splice(0);
    requests.forEach((req) => {
      req.reject(error);
    });
  }

  startTokenCheck() {
    this.stopTokenCheck();
    this.refreshTimer = setInterval(() => {
      this.refreshAccessToken().catch(() => {
        window.location.href = "/login";
      });
    }, this.checkInterval);
  }

  stopTokenCheck() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

class ApiClient {
  constructor() {
    this.tokenManager = new TokenManager();
  }

  async fetch(url, options) {
    options = options || {};
    options.credentials = "include";

    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      throw networkError;
    }

    if (response.status === 401) {
      const refreshSuccess = await this.tokenManager.refreshAccessToken();

      if (refreshSuccess) {
        response = await fetch(url, options);
      } else {
        window.location.href = "/login";
      }
    }

    return response;
  }

  async get(url) {
    return this.fetch(url);
  }

  async post(url, data) {
    return this.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async put(url, data) {
    const options = { method: "PUT" };
    if (data && Object.keys(data).length > 0) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(data);
    }
    return this.fetch(url, options);
  }

  async delete(url) {
    return this.fetch(url, { method: "DELETE" });
  }
}

var api = new ApiClient();

class SocketManager {
  constructor() {
    this.socket = null;
  }

  connect(userId, isAdmin) {
    if (this.socket && this.socket.connected) return this.socket;
    this.socket = io(window.location.origin, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", function () {
      if (isAdmin) {
        this.emit("join-admin-dashboard");
      } else if (userId) {
        this.emit("join-dashboard", {
          _id: userId,
          username: window.userData?.username || "Unknown",
          email: window.userData?.email || "",
          role: window.userData?.role || "user",
        });
      }
    });
    this.socket.on("online-stats", function (stats) {
      const el = document.getElementById("headerOnlineCount");
      if (el && stats && typeof stats.total === "number") {
        el.textContent = stats.total;
      }
    });
    this.socket.on("connect_error", function (error) {
      console.warn("Socket error:", error.message);
    });
    return this.socket;
  }

  getSocket() {
    return this.socket;
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
  }
}

async function logout() {
  try {
    await api.post("/api/auth/logout");
  } catch (e) {}
  api.tokenManager.stopTokenCheck();
  window.location.href = "/login";
}

function initializeDashboard(user) {
  var socketManager = new SocketManager();
  var socket = socketManager.connect(user._id, false);
  var currentPage = 1;

  socket.on("link-created", function () {
    loadLinks();
    updateStats();
  });
  socket.on("link-updated", function () {
    loadLinks();
  });
  socket.on("link-deleted", function () {
    loadLinks();
  });
  socket.on("link-clicked", function () {
    updateStats();
  });
  socket.on("link-status-changed", function () {
    loadLinks();
    updateStats();
  });

  loadLinks();
  updateStats();
  loadDailyLimit();

  document.getElementById("linkSearchInput") &&
    document
      .getElementById("linkSearchInput")
      .addEventListener("input", debounce(loadLinks, 300));

  document.getElementById("createLinkForm") &&
    document
      .getElementById("createLinkForm")
      .addEventListener("submit", async function (e) {
        e.preventDefault();
        var originalUrl = document.getElementById("modalOriginalUrl").value;
        var customCode = document.getElementById("modalCustomCode").value;
        var title = document.getElementById("modalTitle").value;
        try {
          var response = await api.post("/api/links/shorten", {
            originalUrl: originalUrl,
            customCode: customCode,
            title: title,
          });
          var data = await response.json();
          if (data.success) {
            closeCreateModal();
            loadLinks();
            updateStats();
            loadDailyLimit();
            if (typeof showToast === "function")
              showToast("Link created successfully", "success");
          } else {
            showModalError(data.message);
          }
        } catch (err) {
          showModalError("Failed to create link");
        }
      });

  document.getElementById("profileForm") &&
    document
      .getElementById("profileForm")
      .addEventListener("submit", async function (e) {
        e.preventDefault();
        var username = document.getElementById("profileUsername").value;
        var email = document.getElementById("profileEmail").value;
        try {
          var response = await api.put("/api/auth/profile", {
            username: username,
            email: email,
          });
          var data = await response.json();
          var msgDiv = document.getElementById("profileMessage");
          msgDiv.classList.remove("hidden");
          if (data.success) {
            msgDiv.className =
              "mt-6 p-4 rounded-xl text-sm font-medium bg-success-bg border border-success/30 text-success";
            msgDiv.innerHTML =
              '<i class="fas fa-check-circle mr-2"></i>Profile updated successfully';
            setTimeout(function () {
              window.location.reload();
            }, 1000);
          } else {
            msgDiv.className =
              "mt-6 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
            msgDiv.innerHTML =
              '<i class="fas fa-exclamation-circle mr-2"></i>' + data.message;
          }
          setTimeout(function () {
            msgDiv.classList.add("hidden");
          }, 4000);
        } catch (err) {
          console.error("Profile error:", err);
        }
      });

  document.getElementById("changePasswordBtn") &&
    document
      .getElementById("changePasswordBtn")
      .addEventListener("click", async function () {
        var current = document.getElementById("currentPassword").value;
        var newPass = document.getElementById("newPassword").value;
        var confirm = document.getElementById("confirmNewPassword").value;
        var msgDiv = document.getElementById("profileMessage");

        if (!current || !newPass || !confirm) {
          msgDiv.classList.remove("hidden");
          msgDiv.className =
            "mt-6 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
          msgDiv.innerHTML =
            '<i class="fas fa-exclamation-circle mr-2"></i>Please fill in all fields';
          setTimeout(function () {
            msgDiv.classList.add("hidden");
          }, 3000);
          return;
        }
        if (newPass !== confirm) {
          msgDiv.classList.remove("hidden");
          msgDiv.className =
            "mt-6 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
          msgDiv.innerHTML =
            '<i class="fas fa-exclamation-circle mr-2"></i>Passwords do not match';
          setTimeout(function () {
            msgDiv.classList.add("hidden");
          }, 3000);
          return;
        }
        if (newPass.length < 6) {
          msgDiv.classList.remove("hidden");
          msgDiv.className =
            "mt-6 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
          msgDiv.innerHTML =
            '<i class="fas fa-exclamation-circle mr-2"></i>Password must be at least 6 characters';
          setTimeout(function () {
            msgDiv.classList.add("hidden");
          }, 3000);
          return;
        }

        try {
          var response = await api.put("/api/auth/change-password", {
            currentPassword: current,
            newPassword: newPass,
          });
          var data = await response.json();
          msgDiv.classList.remove("hidden");
          if (data.success) {
            msgDiv.className =
              "mt-6 p-4 rounded-xl text-sm font-medium bg-success-bg border border-success/30 text-success";
            msgDiv.innerHTML =
              '<i class="fas fa-check-circle mr-2"></i>Password changed successfully';
            document.getElementById("currentPassword").value = "";
            document.getElementById("newPassword").value = "";
            document.getElementById("confirmNewPassword").value = "";
          } else {
            msgDiv.className =
              "mt-6 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
            msgDiv.innerHTML =
              '<i class="fas fa-exclamation-circle mr-2"></i>' + data.message;
          }
          setTimeout(function () {
            msgDiv.classList.add("hidden");
          }, 4000);
        } catch (err) {
          console.error("Password error:", err);
        }
      });

  async function loadLinks() {
    try {
      var searchQuery = document.getElementById("linkSearchInput")
        ? document.getElementById("linkSearchInput").value
        : "";
      var response = await api.get(
        "/api/links/my-links?page=" +
          currentPage +
          "&limit=10&search=" +
          encodeURIComponent(searchQuery),
      );
      var data = await response.json();
      var tbody = document.getElementById("linksTableBody");
      if (!data.links || data.links.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center py-16 text-text-tertiary"><div class="flex flex-col items-center"><div class="w-12 h-12 bg-bg-tertiary rounded-2xl flex items-center justify-center mb-3"><i class="fas fa-link text-text-tertiary"></i></div><p class="text-xs font-medium">No links found</p></div></td></tr>';
      } else {
        tbody.innerHTML = data.links
          .map(function (link) {
            return (
              '<tr class="border-b border-border hover:bg-bg-hover transition-colors">' +
              '<td class="px-6 py-3"><a href="/l/' +
              link.shortCode +
              '" target="_blank" class="text-accent-light hover:underline text-sm font-mono font-medium">/l/' +
              link.shortCode +
              "</a>" +
              (link.title
                ? '<p class="text-xs text-text-tertiary mt-0.5">' +
                  link.title +
                  "</p>"
                : "") +
              "</td>" +
              '<td class="px-6 py-3 text-text-secondary text-xs hidden lg:table-cell max-w-[200px] truncate" title="' +
              link.originalUrl +
              '">' +
              link.originalUrl +
              "</td>" +
              '<td class="px-6 py-3 text-center text-sm text-text-primary font-semibold">' +
              (link.clicks || 0) +
              "</td>" +
              '<td class="px-6 py-3"><span class="badge ' +
              (link.isActive
                ? "bg-success/10 text-success"
                : "bg-error/10 text-error") +
              '">' +
              (link.isActive ? "Active" : "Inactive") +
              "</span>" +
              (link.deactivatedByAdmin
                ? '<span class="badge bg-warning/10 text-warning ml-1"><i class="fas fa-lock text-[8px] mr-1"></i>Locked</span>'
                : "") +
              (link.isBlacklisted
                ? '<span class="badge bg-error/10 text-error ml-1">Blocked</span>'
                : "") +
              "</td>" +
              '<td class="px-6 py-3 text-right"><div class="flex items-center justify-end gap-1">' +
              '<a href="/stats/' +
              link.shortCode +
              '" class="text-xs text-accent-light hover:text-accent px-2 py-1 transition-colors" title="View Stats"><i class="fas fa-chart-bar"></i></a>' +
              (link.deactivatedByAdmin
                ? '<span class="text-xs text-text-tertiary px-2 py-1" title="Deactivated by admin"><i class="fas fa-lock"></i></span>'
                : "<button onclick=\"toggleLinkStatus('" +
                  link._id +
                  '\')" class="text-xs text-text-secondary hover:text-text-primary px-2 py-1 transition-colors" title="' +
                  (link.isActive ? "Deactivate" : "Activate") +
                  '"><i class="fas fa-' +
                  (link.isActive ? "toggle-on" : "toggle-off") +
                  ' text-base"></i></button>') +
              "<button onclick=\"deleteLink('" +
              link._id +
              '\')" class="text-xs text-error hover:text-red-400 px-2 py-1 transition-colors" title="Delete"><i class="fas fa-trash-alt"></i></button></div></td></tr>'
            );
          })
          .join("");
      }
      updatePagination(data);
    } catch (err) {
      console.error("Load links error:", err);
    }
  }

  async function updateStats() {
    try {
      var response = await api.get("/api/links/my-links?limit=1000");
      var data = await response.json();
      var links = data.links || [];
      document.getElementById("totalLinks").textContent = data.total || 0;
      document.getElementById("totalClicks").textContent = links.reduce(
        function (s, l) {
          return s + (l.clicks || 0);
        },
        0,
      );
      document.getElementById("activeLinks").textContent = links.filter(
        function (l) {
          return l.isActive;
        },
      ).length;
    } catch (err) {}
  }

  async function loadDailyLimit() {
    try {
      var response = await api.get("/api/links/daily-stats");
      var data = await response.json();
      if (data.success) {
        document.getElementById("dailyUsage").textContent = data.used;
        document.getElementById("dailyLimit").textContent = data.limit;
        var bar = document.getElementById("dailyUsageBar");
        if (bar) bar.style.width = (data.used / data.limit) * 100 + "%";

        var modalText = document.getElementById("modalLimitText");
        if (modalText) {
          if (data.remaining === 0) {
            modalText.textContent =
              "Daily limit reached. Resets in " + data.resetIn;
          } else {
            modalText.textContent =
              data.used +
              "/" +
              data.limit +
              " used today · " +
              data.remaining +
              " remaining";
          }
        }

        var info = document.getElementById("dailyLimitInfo");
        if (info) {
          if (data.remaining === 0) {
            info.innerHTML =
              '<span class="text-xs text-error font-medium">Daily limit reached. Resets in ' +
              data.resetIn +
              "</span>";
          } else if (data.remaining <= 3) {
            info.innerHTML =
              '<span class="text-xs text-warning font-medium">Only ' +
              data.remaining +
              " remaining today</span>";
          } else {
            info.innerHTML =
              '<span class="text-xs text-text-tertiary">' +
              data.used +
              "/" +
              data.limit +
              " used today · Resets in " +
              data.resetIn +
              "</span>";
          }
        }
      }
    } catch (err) {}
  }

  function updatePagination(data) {
    var pag = document.getElementById("pagination");
    if (!data.totalPages || data.totalPages <= 1) {
      pag.innerHTML = "";
      return;
    }
    pag.innerHTML =
      '<div class="flex items-center justify-between"><button onclick="changePage(' +
      (currentPage - 1) +
      ')" ' +
      (currentPage === 1 ? "disabled" : "") +
      ' class="text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors px-2 py-1">← Previous</button><span class="text-xs text-text-tertiary">Page ' +
      data.page +
      " of " +
      data.totalPages +
      '</span><button onclick="changePage(' +
      (currentPage + 1) +
      ')" ' +
      (currentPage === data.totalPages ? "disabled" : "") +
      ' class="text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors px-2 py-1">Next →</button></div>';
  }

  window.changePage = function (page) {
    currentPage = page;
    loadLinks();
  };

  window.toggleLinkStatus = async function (linkId) {
    try {
      var response = await api.get("/api/links/" + linkId + "/stats");
      var data = await response.json();
      if (data.link && data.link.deactivatedByAdmin) {
        if (typeof showToast === "function")
          showToast("This link is locked by admin", "warning");
        return;
      }
      await api.put("/api/links/" + linkId, { isActive: !data.link.isActive });
      loadLinks();
      updateStats();
      if (typeof showToast === "function")
        showToast("Link status updated", "success");
    } catch (err) {
      if (typeof showToast === "function")
        showToast("Failed to update link", "error");
    }
  };

  window.deleteLink = async function (linkId) {
    var confirmed = true;
    if (typeof showConfirm === "function") {
      confirmed = await showConfirm(
        "Are you sure you want to delete this link? This action cannot be undone.",
      );
    } else {
      confirmed = confirm("Are you sure you want to delete this link?");
    }
    if (confirmed) {
      try {
        await api.delete("/api/links/" + linkId);
        loadLinks();
        updateStats();
        if (typeof showToast === "function")
          showToast("Link deleted successfully", "success");
      } catch (err) {
        if (typeof showToast === "function")
          showToast("Failed to delete link", "error");
      }
    }
  };
}

function initializeAdminDashboard(user) {
  var socketManager = new SocketManager();
  var socket = socketManager.connect(user._id, true);
  var currentUsersPage = 1;
  var currentLinksPage = 1;

  socket.on("user-status-changed", function () {
    loadUsers();
  });
  socket.on("link-stats-update", function () {
    loadLinks();
    loadStats();
  });
  socket.on("link-status-changed", function () {
    loadLinks();
  });
  socket.on("link-blacklist-changed", function () {
    loadLinks();
    loadBlacklist();
  });
  socket.on("domain-blacklisted", function () {
    loadBlacklist();
  });
  socket.on("domain-unblacklisted", function () {
    loadBlacklist();
  });

  document.getElementById("adminTabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".tab-btn");
    if (!btn || !btn.dataset.tab) return;
    document.querySelectorAll("#adminTabs .tab-btn").forEach(function (b) {
      b.className =
        "tab-btn px-5 py-3 text-xs font-bold border-b-2 border-transparent text-text-tertiary hover:text-text-secondary transition-all";
    });
    btn.className =
      "tab-btn px-5 py-3 text-xs font-bold border-b-2 border-white text-text-primary transition-all";
    ["usersTab", "linksTab", "blacklistTab", "profileTab"].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.add("hidden");
      },
    );
    var tab = document.getElementById(btn.dataset.tab + "Tab");
    if (tab) tab.classList.remove("hidden");
    if (btn.dataset.tab === "users") loadUsers();
    if (btn.dataset.tab === "links") loadLinks();
    if (btn.dataset.tab === "blacklist") loadBlacklist();
  });

  document.getElementById("userSearch") &&
    document
      .getElementById("userSearch")
      .addEventListener("input", debounce(loadUsers, 300));
  document.getElementById("userRoleFilter") &&
    document
      .getElementById("userRoleFilter")
      .addEventListener("change", loadUsers);
  document.getElementById("userStatusFilter") &&
    document
      .getElementById("userStatusFilter")
      .addEventListener("change", loadUsers);
  document.getElementById("linkSearch") &&
    document
      .getElementById("linkSearch")
      .addEventListener("input", debounce(loadLinks, 300));
  document.getElementById("linkStatusFilter") &&
    document
      .getElementById("linkStatusFilter")
      .addEventListener("change", loadLinks);

  document.getElementById("adminProfileForm") &&
    document
      .getElementById("adminProfileForm")
      .addEventListener("submit", async function (e) {
        e.preventDefault();
        try {
          var r = await api.put("/api/auth/profile", {
            username: document.getElementById("adminProfileUsername").value,
            email: document.getElementById("adminProfileEmail").value,
          });
          var d = await r.json();
          var msg = document.getElementById("adminProfileMessage");
          msg.classList.remove("hidden");
          if (d.success) {
            msg.className =
              "mt-4 p-4 rounded-xl text-sm font-medium bg-success-bg border border-success/30 text-success";
            msg.innerHTML =
              '<i class="fas fa-check-circle mr-2"></i>Profile updated';
            setTimeout(function () {
              window.location.reload();
            }, 1000);
          } else {
            msg.className =
              "mt-4 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
            msg.innerHTML =
              '<i class="fas fa-exclamation-circle mr-2"></i>' + d.message;
          }
          setTimeout(function () {
            msg.classList.add("hidden");
          }, 4000);
        } catch (e) {}
      });

  document.getElementById("adminChangePasswordBtn") &&
    document
      .getElementById("adminChangePasswordBtn")
      .addEventListener("click", async function () {
        var c = document.getElementById("adminCurrentPassword").value;
        var n = document.getElementById("adminNewPassword").value;
        var cf = document.getElementById("adminConfirmNewPassword").value;
        var msg = document.getElementById("adminProfileMessage");
        if (!c || !n || !cf) {
          msg.classList.remove("hidden");
          msg.className =
            "mt-4 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
          msg.innerHTML =
            '<i class="fas fa-exclamation-circle mr-2"></i>Fill all fields';
          setTimeout(function () {
            msg.classList.add("hidden");
          }, 3000);
          return;
        }
        if (n !== cf) {
          msg.classList.remove("hidden");
          msg.className =
            "mt-4 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
          msg.innerHTML =
            '<i class="fas fa-exclamation-circle mr-2"></i>Passwords do not match';
          setTimeout(function () {
            msg.classList.add("hidden");
          }, 3000);
          return;
        }
        try {
          var r = await api.put("/api/auth/change-password", {
            currentPassword: c,
            newPassword: n,
          });
          var d = await r.json();
          msg.classList.remove("hidden");
          if (d.success) {
            msg.className =
              "mt-4 p-4 rounded-xl text-sm font-medium bg-success-bg border border-success/30 text-success";
            msg.innerHTML =
              '<i class="fas fa-check-circle mr-2"></i>Password changed';
            document.getElementById("adminCurrentPassword").value = "";
            document.getElementById("adminNewPassword").value = "";
            document.getElementById("adminConfirmNewPassword").value = "";
          } else {
            msg.className =
              "mt-4 p-4 rounded-xl text-sm font-medium bg-error-bg border border-error/30 text-error";
            msg.innerHTML =
              '<i class="fas fa-exclamation-circle mr-2"></i>' + d.message;
          }
          setTimeout(function () {
            msg.classList.add("hidden");
          }, 4000);
        } catch (e) {}
      });

  loadStats();
  loadUsers();
  loadLinks();
  loadBlacklist();
  loadAdminDailyLimit();

  async function loadStats() {
    try {
      var r = await api.get("/api/admin/stats");
      var d = await r.json();

      if (d.stats) {
        document.getElementById("adminTotalUsers").textContent =
          d.stats.totalUsers || 0;
        document.getElementById("adminTotalLinks").textContent =
          d.stats.totalLinks || 0;
        document.getElementById("adminTotalClicks").textContent =
          d.stats.totalClicks || 0;
        document.getElementById("adminBlacklistedLinks").textContent =
          d.stats.blacklistedLinks || 0;
      }
    } catch (e) {}
  }

  async function loadAdminDailyLimit() {
    try {
      var r = await api.get("/api/links/daily-stats");
      var d = await r.json();
      if (d.success) {
        document.getElementById("adminDailyUsage").textContent = d.used;
        document.getElementById("adminDailyLimit").textContent = d.limit;

        var bar = document.getElementById("adminDailyUsageBar");
        if (bar) bar.style.width = (d.used / d.limit) * 100 + "%";

        var modalText = document.getElementById("modalLimitText");
        if (modalText) {
          if (d.remaining === 0) {
            modalText.textContent =
              "Daily limit reached. Resets in " + d.resetIn;
          } else {
            modalText.textContent =
              d.used +
              "/" +
              d.limit +
              " used today · " +
              d.remaining +
              " remaining";
          }
        }

        var info = document.getElementById("adminDailyLimitInfo");
        if (info) {
          if (d.remaining === 0) {
            info.innerHTML =
              '<span class="text-xs text-error font-medium">Limit reached. Resets in ' +
              d.resetIn +
              "</span>";
          } else {
            info.innerHTML =
              '<span class="text-xs text-text-tertiary">' +
              d.used +
              "/" +
              d.limit +
              " used today · Resets in " +
              d.resetIn +
              "</span>";
          }
        }
      }
    } catch (e) {}
  }

  async function loadUsers() {
    var search = document.getElementById("userSearch")
      ? document.getElementById("userSearch").value
      : "";
    var role = document.getElementById("userRoleFilter")
      ? document.getElementById("userRoleFilter").value
      : "";
    var status = document.getElementById("userStatusFilter")
      ? document.getElementById("userStatusFilter").value
      : "";
    try {
      var params = new URLSearchParams({
        page: currentUsersPage,
        search: search,
        role: role,
      });
      if (status) params.append("isActive", status);
      var r = await api.get("/api/admin/users?" + params.toString());
      var d = await r.json();
      document.getElementById("usersCount").textContent = d.total || 0;
      var tbody = document.getElementById("usersTableBody");
      if (!d.users || d.users.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center py-12 text-text-tertiary text-sm">No users found</td></tr>';
      } else {
        tbody.innerHTML = d.users
          .map(function (u) {
            return (
              '<tr class="border-b border-border hover:bg-bg-hover transition-colors">' +
              '<td class="px-4 py-3"><div class="flex items-center gap-2"><div class="w-7 h-7 bg-white rounded-full flex items-center justify-center text-black text-[10px] font-bold">' +
              u.username.charAt(0).toUpperCase() +
              '</div><span class="text-sm font-medium text-text-primary">' +
              u.username +
              "</span></div></td>" +
              '<td class="px-4 py-3 text-xs text-text-secondary hidden md:table-cell">' +
              u.email +
              "</td>" +
              '<td class="px-4 py-3"><span class="badge ' +
              (u.role === "admin"
                ? "bg-accent/10 text-accent"
                : "bg-bg-tertiary text-text-secondary") +
              '">' +
              u.role +
              "</span></td>" +
              '<td class="px-4 py-3"><span class="badge ' +
              (u.isActive
                ? "bg-success/10 text-success"
                : "bg-error/10 text-error") +
              '">' +
              (u.isActive ? "Active" : "Inactive") +
              "</span></td>" +
              '<td class="px-4 py-3 text-right">' +
              (u.role !== "admin"
                ? "<button onclick=\"toggleUserStatus('" +
                  u._id +
                  '\')" class="text-xs ' +
                  (u.isActive
                    ? "text-error hover:text-red-400"
                    : "text-success hover:text-green-400") +
                  ' transition-colors">' +
                  (u.isActive ? "Deactivate" : "Activate") +
                  "</button>"
                : '<span class="text-xs text-text-tertiary">—</span>') +
              "</td></tr>"
            );
          })
          .join("");
      }
    } catch (e) {}
  }

  async function loadLinks() {
    var search = document.getElementById("linkSearch")
      ? document.getElementById("linkSearch").value
      : "";
    var status = document.getElementById("linkStatusFilter")
      ? document.getElementById("linkStatusFilter").value
      : "";
    try {
      var params = new URLSearchParams({
        page: currentLinksPage,
        search: search,
      });
      if (status === "blacklisted") params.append("isBlacklisted", "true");
      else if (status) params.append("isActive", status);
      var r = await api.get("/api/admin/links?" + params.toString());
      var d = await r.json();
      document.getElementById("linksCount").textContent = d.total || 0;
      var tbody = document.getElementById("linksTableBody");
      if (!d.links || d.links.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="6" class="text-center py-12 text-text-tertiary text-sm">No links found</td></tr>';
      } else {
        tbody.innerHTML = d.links
          .map(function (l) {
            return (
              '<tr class="border-b border-border hover:bg-bg-hover transition-colors">' +
              '<td class="px-4 py-3"><code class="text-xs text-accent-light font-mono">' +
              l.shortCode +
              "</code></td>" +
              '<td class="px-4 py-3 text-xs text-text-secondary hidden md:table-cell max-w-[200px] truncate" title="' +
              l.originalUrl +
              '">' +
              l.originalUrl +
              "</td>" +
              '<td class="px-4 py-3 text-xs text-text-secondary">' +
              (l.userId ? l.userId.username : "Guest") +
              "</td>" +
              '<td class="px-4 py-3 text-xs text-text-primary font-semibold">' +
              (l.clicks || 0) +
              "</td>" +
              '<td class="px-4 py-3"><span class="badge ' +
              (l.isActive
                ? "bg-success/10 text-success"
                : "bg-error/10 text-error") +
              '">' +
              (l.isActive ? "Active" : "Inactive") +
              "</span>" +
              (l.isBlacklisted
                ? '<span class="badge bg-error/10 text-error ml-1">Blocked</span>'
                : "") +
              "</td>" +
              '<td class="px-4 py-3 text-right"><div class="flex items-center justify-end gap-1"><button onclick="toggleLinkStatusAdmin(\'' +
              l._id +
              '\')" class="text-xs text-text-secondary hover:text-text-primary px-2 py-1 transition-colors"><i class="fas fa-' +
              (l.isActive ? "toggle-on" : "toggle-off") +
              ' text-base"></i></button><button onclick="toggleBlacklistLink(\'' +
              l._id +
              '\')" class="text-xs ' +
              (l.isBlacklisted
                ? "text-success hover:text-green-400"
                : "text-error hover:text-red-400") +
              ' px-2 py-1 transition-colors"><i class="fas fa-' +
              (l.isBlacklisted ? "check-circle" : "ban") +
              '"></i></button></div></td></tr>'
            );
          })
          .join("");
      }
    } catch (e) {}
  }

  async function loadBlacklist() {
    try {
      var r = await api.get("/api/admin/blacklist");
      var d = await r.json();
      document.getElementById("blacklistCount").textContent = (
        d.blacklist || []
      ).length;
      var tbody = document.getElementById("blacklistTableBody");
      if (!d.blacklist || d.blacklist.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="4" class="text-center py-12 text-text-tertiary text-sm">No entries</td></tr>';
      } else {
        tbody.innerHTML = d.blacklist
          .map(function (item) {
            return (
              '<tr class="border-b border-border hover:bg-bg-hover transition-colors">' +
              '<td class="px-4 py-3"><code class="text-xs text-error font-mono">' +
              item.domain +
              "</code></td>" +
              '<td class="px-4 py-3"><span class="badge bg-bg-tertiary text-text-secondary">' +
              (item.isRegex ? "Regex" : "Text") +
              "</span></td>" +
              '<td class="px-4 py-3 text-xs text-text-secondary hidden md:table-cell">' +
              (item.addedBy ? item.addedBy.username : "Unknown") +
              "</td>" +
              '<td class="px-4 py-3 text-right"><button onclick="removeFromBlacklist(\'' +
              item._id +
              '\')" class="text-xs text-success hover:text-green-400 transition-colors">Remove</button></td></tr>'
            );
          })
          .join("");
      }
    } catch (e) {}
  }

  window.toggleUserStatus = async function (userId) {
    var confirmed = true;
    if (typeof showConfirm === "function") {
      confirmed = await showConfirm("Change this user's status?");
    } else {
      confirmed = confirm("Change this user's status?");
    }
    if (!confirmed) return;
    try {
      await api.put("/api/admin/users/" + userId + "/toggle-status");
      loadUsers();
      loadStats();
    } catch (e) {
      if (typeof showToast === "function") showToast("Failed", "error");
    }
  };
  window.toggleLinkStatusAdmin = async function (linkId) {
    try {
      await api.put("/api/admin/links/" + linkId + "/toggle-status");
      loadLinks();
      loadStats();
    } catch (e) {}
  };
  window.toggleBlacklistLink = async function (linkId) {
    try {
      await api.put("/api/admin/links/" + linkId + "/blacklist");
      loadLinks();
      loadStats();
    } catch (e) {}
  };
  window.addDomainToBlacklist = async function () {
    var domain = document.getElementById("domainInput").value.trim();
    var isRegex = document.getElementById("isRegexCheckbox")
      ? document.getElementById("isRegexCheckbox").checked
      : false;
    if (!domain) {
      if (typeof showToast === "function")
        showToast("Enter a pattern", "warning");
      return;
    }
    try {
      await api.post("/api/admin/blacklist", {
        domain: domain,
        isRegex: isRegex,
      });
      document.getElementById("domainInput").value = "";
      loadBlacklist();
      if (typeof showToast === "function")
        showToast("Added to blacklist", "success");
    } catch (e) {
      if (typeof showToast === "function") showToast("Failed", "error");
    }
  };
  window.removeFromBlacklist = async function (id) {
    var c = true;
    if (typeof showConfirm === "function") {
      c = await showConfirm("Remove from blacklist?");
    } else {
      c = confirm("Remove from blacklist?");
    }
    if (!c) return;
    try {
      await api.delete("/api/admin/blacklist/" + id);
      loadBlacklist();
    } catch (e) {}
  };
}

function showCreateModal() {
  var m = document.getElementById("createModal");
  if (m) {
    m.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
}
function closeCreateModal() {
  var m = document.getElementById("createModal");
  if (m) {
    m.classList.add("hidden");
    document.body.style.overflow = "";
  }
}
function showModalError(msg) {
  var e = document.getElementById("modalError");
  var em = document.getElementById("modalErrorMessage");
  if (e && em) {
    e.classList.remove("hidden");
    em.textContent = msg;
  }
}

function debounce(fn, wait) {
  var timeout;
  return function () {
    var args = arguments;
    var ctx = this;
    clearTimeout(timeout);
    timeout = setTimeout(function () {
      fn.apply(ctx, args);
    }, wait);
  };
}

(async function initializeToken() {
  try {
    if (
      window.location.pathname === "/login" ||
      window.location.pathname === "/register"
    ) {
      const refreshed = await api.tokenManager.refreshAccessToken();
      if (refreshed) {
        window.location.href = "/dashboard";
      }
    } else if (window.userData) {
      await api.tokenManager.refreshAccessToken();
      api.tokenManager.startTokenCheck();
    }
  } catch (error) {}
})();

document.addEventListener("DOMContentLoaded", function () {
  if (window.userData) {
    api.tokenManager.startTokenCheck();

    if (!window.socket) {
      const socketManager = new SocketManager();
      window.socket = socketManager.connect(
        window.userData._id,
        window.userData.role === "admin",
      );
      window.socketManager = socketManager;
    }
  }
});
