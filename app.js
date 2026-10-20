“use strict”;

// ==========================================
// TEMP COVER CUSTOMER PORTAL
// APP.JS
// ==========================================

// Supabase configuration
const SUPABASE_URL = “https://lvjdaizpaqjnchjvrsni.supabase.co”;
const SUPABASE_ANON_KEY = “sb_publishable_fnag8tkEEClWTLVR7fL1sQ_3_rbAzEc”;

const supabaseClient = window.supabase.createClient(
SUPABASE_URL,
SUPABASE_ANON_KEY
);

let currentUser = null;
let currentPolicy = null;
let countdownInterval = null;
let currentScreen = “homeScreen”;

// Notification centre state
let customerNotifications = [];
let notificationChannel = null;

const $ = (id) => document.getElementById(id);

function setText(id, value, fallback = “Not provided”) {
const element = $(id);
if (element) {
element.textContent =
value !== null && value !== undefined && String(value).trim() !== “”
? String(value)
: fallback;
}
}

function formatDate(value) {
if (!value) return “Not provided”;

const date = new Date(value);
if (Number.isNaN(date.getTime())) return "Not provided";
return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

}

function formatMoney(value) {
if (value === null || value === undefined || value === “”) {
return “Not provided”;
}

const amount = Number(value);
if (!Number.isFinite(amount)) return "Not provided";
return amount.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP"
});

}

function firstAvailable(…values) {
for (const value of values) {
if (value !== null && value !== undefined && String(value).trim() !== “”) {
return value;
}
}
return “Not provided”;
}

// ==========================================
// AUTHENTICATION AND INITIAL LOAD
// ==========================================

document.addEventListener(“DOMContentLoaded”, async () => {
try {
const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data?.user) {
        window.location.replace("login.html");
        return;
    }
    currentUser = data.user;
    updateGreeting(currentUser);
    await Promise.all([
        loadProfile(currentUser),
        loadPolicy(currentUser.id)
    ]);
    bindNavigation();
    bindPolicyButtons();
    bindLogout();
    bindNotifications();
    refreshPolicyStatus();
    window.setInterval(refreshPolicyStatus, 60000);
} catch (error) {
    console.error("Portal initialisation failed:", error);
}

});

// ==========================================
// CUSTOMER GREETING
// ==========================================

function updateGreeting(user) {
const metadata = user.user_metadata || {};

const fullName = firstAvailable(
    metadata.full_name,
    metadata.name,
    metadata.first_name,
    user.email?.split("@")[0]
);
setText(
    "dashboardGreeting",
    fullName === "Not provided" ? "Welcome" : fullName
);
const hour = new Date().getHours();
let greeting = "Welcome to your account";
if (hour < 12) greeting = "Good morning 👋";
else if (hour < 18) greeting = "Good afternoon 👋";
else greeting = "Good evening 👋";
setText("greetingMessage", greeting);

}

// ==========================================
// TEMP COVER NOTIFICATION CENTRE
// Uses the existing customer_notifications table
// ==========================================

function bindNotifications() {
const button = $(“notificationButton”);
const panel = $(“notificationPanel”);
const markAllButton = $(“markAllNotificationsRead”);

if (!button || !panel || !currentUser) return;
// Avoid binding the same notification controls more than once.
if (button.dataset.notificationsBound === "true") return;
button.dataset.notificationsBound = "true";
button.setAttribute("aria-expanded", "false");
button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
    if (opening) {
        await loadCustomerNotifications();
    }
});
panel.addEventListener("click", (event) => {
    event.stopPropagation();
});
document.addEventListener("click", (event) => {
    if (
        !panel.hidden &&
        !event.target.closest(".notification-wrap")
    ) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
    }
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.focus();
    }
});
if (markAllButton) {
    markAllButton.addEventListener(
        "click",
        markAllCustomerNotificationsRead
    );
}
// Load notifications immediately so the unread count appears.
loadCustomerNotifications();
// Subscribe to live updates, if Realtime is enabled for this table.
if (notificationChannel) {
    supabaseClient.removeChannel(notificationChannel);
    notificationChannel = null;
}
notificationChannel = supabaseClient
    .channel("customer-notifications-" + currentUser.id)
    .on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "customer_notifications",
            filter: "user_id=eq." + currentUser.id
        },
        () => {
            loadCustomerNotifications();
        }
    )
    .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(
                "Notification live updates are unavailable. " +
                "Notifications can still be loaded when the bell is opened."
            );
        }
    });

}

async function loadCustomerNotifications() {
if (!currentUser) return;

const list = $("notificationList");
if (!list) return;
list.innerHTML =
    '<p style="padding:15px 0;color:#737e90;font-size:13px">Loading notifications…</p>';
const { data, error } = await supabaseClient
    .from("customer_notifications")
    .select(
        "id,user_id,policy_id,type,title,message,is_read,created_at,read_at"
    )
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);
if (error) {
    console.error("Could not load notifications:", error);
    list.innerHTML =
        '<p style="padding:15px 0;color:#737e90;font-size:13px">Notifications could not be loaded. Please try again.</p>';
    return;
}
customerNotifications = data || [];
renderCustomerNotifications();

}

function renderCustomerNotifications() {
const list = $(“notificationList”);
const badge = $(“notificationCount”);
const summary = $(“notificationSummary”);
const markAllButton = $(“markAllNotificationsRead”);

if (!list) return;
const unreadCount = customerNotifications.filter(
    (notification) => !notification.is_read
).length;
if (badge) {
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.style.display = unreadCount ? "flex" : "none";
}
if (summary) {
    summary.textContent = unreadCount
        ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
        : "You're all caught up";
}
if (markAllButton) {
    markAllButton.disabled = unreadCount === 0;
    markAllButton.style.opacity = unreadCount === 0 ? ".45" : "1";
    markAllButton.style.cursor = unreadCount === 0 ? "default" : "pointer";
}
list.replaceChildren();
if (!customerNotifications.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding:22px 5px;text-align:center";
    const title = document.createElement("p");
    title.textContent = "You're all caught up";
    title.style.cssText =
        "margin:0 0 7px;font-size:14px;font-weight:800";
    const message = document.createElement("p");
    message.textContent =
        "New account and policy updates will appear here.";
    message.style.cssText =
        "margin:0;color:#737e90;font-size:12px;line-height:1.5";
    empty.append(title, message);
    list.appendChild(empty);
    return;
}
customerNotifications.forEach((notification) => {
    const item = document.createElement("button");
    item.type = "button";
    item.style.cssText = [
        "display:flex",
        "width:100%",
        "gap:11px",
        "align-items:flex-start",
        "padding:13px 4px",
        "text-align:left",
        "border:0",
        "border-bottom:1px solid #edf0f3",
        "background:" + (notification.is_read ? "white" : "#fff8f2"),
        "color:#172033",
        "cursor:" + (notification.is_read ? "default" : "pointer")
    ].join(";");
    const icon = document.createElement("span");
    icon.textContent = getCustomerNotificationIcon(notification.type);
    icon.style.cssText =
        "width:35px;height:35px;flex-shrink:0;display:grid;" +
        "place-items:center;border-radius:11px;" +
        "background:#fff2e8;font-size:16px";
    const content = document.createElement("span");
    content.style.cssText = "display:block;flex:1;min-width:0";
    const heading = document.createElement("span");
    heading.textContent = notification.title || "Account update";
    heading.style.cssText =
        "display:block;margin:0 0 5px;font-size:13px;" +
        "font-weight:800;overflow-wrap:anywhere";
    const message = document.createElement("span");
    message.textContent = notification.message || "";
    message.style.cssText =
        "display:block;color:#737e90;font-size:12px;" +
        "line-height:1.5;overflow-wrap:anywhere";
    const date = document.createElement("span");
    date.textContent = formatCustomerNotificationDate(
        notification.created_at
    );
    date.style.cssText =
        "display:block;margin-top:7px;color:#929aaa;font-size:10px";
    content.append(heading, message, date);
    if (!notification.is_read) {
        const unreadDot = document.createElement("span");
        unreadDot.setAttribute("aria-label", "Unread");
        unreadDot.style.cssText =
            "width:7px;height:7px;flex-shrink:0;margin-top:6px;" +
            "border-radius:50%;background:#ff7a00";
        item.append(icon, content, unreadDot);
    } else {
        item.append(icon, content);
    }
    item.addEventListener("click", async () => {
        if (!notification.is_read) {
            await markCustomerNotificationRead(notification);
        }
    });
    list.appendChild(item);
});

}

function getCustomerNotificationIcon(type) {
const value = String(type || “”).toLowerCase();

if (value.includes("payment")) return "£";
if (value.includes("certificate")) return "📄";
if (value.includes("expiry") || value.includes("expire")) return "⏰";
if (value.includes("policy")) return "🛡️";
if (value.includes("account") || value.includes("welcome")) return "👤";
return "🔔";

}

function formatCustomerNotificationDate(value) {
if (!value) return “”;

const date = new Date(value);
if (Number.isNaN(date.getTime())) return "";
return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

}

async function markCustomerNotificationRead(notification) {
if (!currentUser || notification.is_read) return;

const { error } = await supabaseClient
    .from("customer_notifications")
    .update({
        is_read: true,
        read_at: new Date().toISOString()
    })
    .eq("id", notification.id)
    .eq("user_id", currentUser.id)
    .eq("is_read", false);
if (error) {
    console.error("Could not mark notification as read:", error);
    return;
}
notification.is_read = true;
notification.read_at = new Date().toISOString();
renderCustomerNotifications();

}

async function markAllCustomerNotificationsRead() {
if (!currentUser) return;

const unreadIds = customerNotifications
    .filter((notification) => !notification.is_read)
    .map((notification) => notification.id);
if (!unreadIds.length) return;
const { error } = await supabaseClient
    .from("customer_notifications")
    .update({
        is_read: true,
        read_at: new Date().toISOString()
    })
    .eq("user_id", currentUser.id)
    .eq("is_read", false)
    .in("id", unreadIds);
if (error) {
    console.error("Could not mark notifications as read:", error);
    return;
}
customerNotifications.forEach((notification) => {
    if (unreadIds.includes(notification.id)) {
        notification.is_read = true;
        notification.read_at = new Date().toISOString();
    }
});
renderCustomerNotifications();

}

// ==========================================
// SCREEN NAVIGATION
// ==========================================

function showScreen(screenId) {
const allowedScreens = [
“homeScreen”,
“detailsScreen”,
“profileScreen”,
“faqScreen”
];

if (!allowedScreens.includes(screenId)) {
    screenId = "homeScreen";
}
document.querySelectorAll(".page-screen").forEach((screen) => {
    const isActive = screen.id === screenId;
    screen.classList.toggle("active", isActive);
    screen.setAttribute("aria-hidden", String(!isActive));
});
document.querySelectorAll(".bottom-nav [data-screen]").forEach((button) => {
    const isActive = button.dataset.screen === screenId;
    button.classList.toggle("active", isActive);
    if (isActive) {
        button.setAttribute("aria-current", "page");
    } else {
        button.removeAttribute("aria-current");
    }
});
currentScreen = screenId;
window.scrollTo({
    top: 0,
    behavior: "auto"
});

}

function bindNavigation() {
document.querySelectorAll(”.bottom-nav [data-screen]”).forEach((button) => {
button.addEventListener(“click”, () => {
showScreen(button.dataset.screen);
});
});

document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(button.dataset.go);
    });
});

}

// ==========================================
// LOAD CUSTOMER PROFILE
// ==========================================

async function loadProfile(user) {
const metadata = user.user_metadata || {};

// Set safe fallback values first, so the screen never stays on Loading.
setText("profileEmail", user.email);
setText("profileName", firstAvailable(
    metadata.full_name,
    metadata.name,
    metadata.first_name
));
setText("profileAddress", metadata.address);
setText("profileLicence", metadata.driving_licence);
setText("profilePhone", metadata.phone);
setText("profileDob", firstAvailable(
    metadata.date_of_birth,
    metadata.dob
));
setText("profileOccupation", metadata.occupation);
const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
if (error) {
    console.error("Could not load customer profile:", error);
    setProfileWelcome();
    return;
}
if (profile) {
    const name = firstAvailable(
        profile.full_name,
        [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(" "),
        metadata.full_name,
        metadata.name
    );
    setText("profileName", name);
    setText("profileEmail", firstAvailable(profile.email, user.email));
    setText("profileAddress", profile.address);
    setText("profileLicence", firstAvailable(
        profile.driving_licence,
        profile.driving_licence_number
    ));
    setText("profilePhone", profile.phone);
    setText("profileDob", firstAvailable(
        profile.date_of_birth,
        profile.dob,
        profile.dob_date
    ));
    setText("profileOccupation", profile.occupation);
}
setProfileWelcome();

}

function setProfileWelcome() {
const name = $(“profileName”)?.textContent || “Your account”;
setText(“profileWelcomeName”, name);

const avatar = $("profileAvatar");
if (avatar) {
    const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
    avatar.textContent = initials || "TC";
}

}

// ==========================================
// LOAD ACTIVE POLICY
// ==========================================

async function loadPolicy(userId) {
const { data, error } = await supabaseClient
.from(“policies”)
.select(”*”)
.eq(“user_id”, userId)
.eq(“status”, “ACTIVE”)
.order(“expiry_time”, { ascending: false })
.limit(1)
.maybeSingle();

if (error) {
    console.error("Could not load active policy:", error);
    showNoActivePolicy();
    return;
}
if (!data) {
    currentPolicy = null;
    showNoActivePolicy();
    return;
}
currentPolicy = data;
window.currentPolicy = data;
setText("vehicleRegistration", data.registration);
setText("vehicleName", [data.make, data.model].filter(Boolean).join(" "));
setText("vehicleDetails", [data.colour, data.year].filter(Boolean).join(" "));
setText("coverType", data.cover_type || "Cover details");
// Use the amount recorded on the policy. This does not initiate a payment.
const recordedAmount =
    data.amount_paid !== null && data.amount_paid !== undefined
        ? data.amount_paid
        : data.price;
setText("policyPrice", formatMoney(recordedAmount), "Not recorded");
setText("paymentStatusText", "Amount recorded on your policy");
setText("activePolicyCount", "1");
setText("vehicleCount", "1 active");
setText("detailRegistration", data.registration);
setText(
    "detailVehicle",
    [data.make, data.model, data.colour, data.year]
        .filter(value =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        )
        .join(" ")
);
setText("detailCoverType", data.cover_type);
setText("detailPolicyNumber", data.policy_number);
setText("detailPolicyStatus", data.status);
setText("detailStartDate", formatDate(data.start_time || data.start_date));
setText("detailExpiryDate", formatDate(data.expiry_time || data.end_date));
setText("detailPrice", formatMoney(recordedAmount), "Not recorded");
$("activePolicyCard").hidden = false;
$("noActivePolicy").hidden = true;
startCountdown(data.expiry_time, data.start_time);
updatePolicyBadge(data.expiry_time);

}

function showNoActivePolicy() {
$(“activePolicyCard”).hidden = true;
$(“noActivePolicy”).hidden = false;

setText("activePolicyCount", "0");
setText("vehicleCount", "0 active");
setText("timeRemaining", "No active policy");
stopCountdown();

}

function updatePolicyBadge(expiryTime) {
const badge = $(“policyStatusBadge”);
if (!badge) return;

const expired =
    expiryTime && new Date(expiryTime).getTime() <= Date.now();
badge.replaceChildren();
const dot = document.createElement("span");
dot.className = "status-dot";
if (expired) {
    dot.style.background = "#ffd0d0";
    badge.append(dot, document.createTextNode(" EXPIRED"));
} else {
    badge.append(dot, document.createTextNode(" ACTIVE"));
}

}

// ==========================================
// POLICY COUNTDOWN
// ==========================================

function stopCountdown() {
if (countdownInterval) {
clearInterval(countdownInterval);
countdownInterval = null;
}
}

function startCountdown(expiryTime, startTime) {
stopCountdown();

if (!expiryTime) {
    setText("timeRemaining", "Expiry time unavailable");
    return;
}
function updateCountdown() {
    const expiry = new Date(expiryTime).getTime();
    const start = startTime ? new Date(startTime).getTime() : NaN;
    const remaining = expiry - Date.now();
    if (!Number.isFinite(expiry)) {
        setText("timeRemaining", "Expiry time unavailable");
        stopCountdown();
        return;
    }
    if (remaining <= 0) {
        setText("timeRemaining", "Policy expired");
        updatePolicyBadge(expiryTime);
        setText("activePolicyCount", "0");
        setText("vehicleCount", "0 active");
        stopCountdown();
        return;
    }
    const totalMinutes = Math.floor(remaining / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const policyLength = expiry - start;
    const isWeekOrLonger =
        Number.isFinite(policyLength) &&
        policyLength >= 6 * 24 * 60 * 60 * 1000;
    let text;
    if (isWeekOrLonger || days > 0) {
        text = `${days}d ${hours}h ${minutes}m remaining`;
    } else {
        text = `${hours}h ${minutes}m remaining`;
    }
    setText("timeRemaining", text);
}
updateCountdown();
countdownInterval = setInterval(updateCountdown, 60000);

}

// ==========================================
// POLICY BUTTONS AND CERTIFICATE
// ==========================================

function bindPolicyButtons() {
$(“viewDetails”)?.addEventListener(“click”, () => {
if (currentPolicy) {
showScreen(“detailsScreen”);
} else {
alert(“No active policy is available to view.”);
}
});

$("viewCertificateButton")?.addEventListener("click", openCertificate);
$("detailsCertificateButton")?.addEventListener("click", openCertificate);

}

async function openCertificate() {
try {
const { data: authData, error: authError } =
await supabaseClient.auth.getUser();

    if (authError || !authData?.user) {
        alert("Your session has expired. Please sign in again.");
        window.location.href = "login.html";
        return;
    }
    const { data, error } = await supabaseClient
        .from("policies")
        .select("*")
        .eq("user_id", authData.user.id)
        .eq("status", "ACTIVE")
        .order("expiry_time", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) {
        console.error("Certificate policy lookup failed:", error);
        alert("No active policy certificate was found.");
        return;
    }
    sessionStorage.setItem("certificateData", JSON.stringify(data));
    window.location.href = "certificate.html";
} catch (error) {
    console.error("Could not open certificate:", error);
    alert("We couldn't open your certificate. Please try again.");
}

}

// Keep support for existing inline certificate buttons, if any.
window.openCertificate = openCertificate;

// ==========================================
// REFRESH POLICY STATUS
// ==========================================

async function refreshPolicyStatus() {
if (!currentUser) return;

const { data, error } = await supabaseClient
    .from("policies")
    .select("status, expiry_time")
    .eq("user_id", currentUser.id)
    .order("expiry_time", { ascending: false })
    .limit(1)
    .maybeSingle();
if (error) {
    console.error("Policy status refresh failed:", error);
    return;
}
if (!data) {
    setText("activePolicyCount", "0");
    setText("vehicleCount", "0 active");
    return;
}
const expiry = data.expiry_time
    ? new Date(data.expiry_time).getTime()
    : NaN;
const isActive =
    data.status === "ACTIVE" &&
    Number.isFinite(expiry) &&
    expiry > Date.now();
setText("activePolicyCount", isActive ? "1" : "0");
setText("vehicleCount", isActive ? "1 active" : "0 active");
if (!isActive) {
    updatePolicyBadge(data.expiry_time);
}

}

// ==========================================
// LOGOUT
// ==========================================

function bindLogout() {
$(“logoutButton”)?.addEventListener(“click”, async () => {
const button = $(“logoutButton”);
if (button) button.disabled = true;

    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error("Logout failed:", error);
            alert("We couldn't log you out. Please try again.");
            if (button) button.disabled = false;
            return;
        }
        window.location.replace("login.html");
    } catch (error) {
        console.error("Logout error:", error);
        alert("We couldn't log you out. Please try again.");
        if (button) button.disabled = false;
    }
});

}
