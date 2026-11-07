
"use strict";

// ==========================================
// TEMP COVER CUSTOMER PORTAL
// APP.JS
// ==========================================

// Supabase configuration
const SUPABASE_URL = "https://lvjdaizpaqjnchjvrsni.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fnag8tkEEClWTLVR7fL1sQ_3_rbAzEc";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

let currentUser = null;
let currentPolicy = null;
let allPolicies = [];
let countdownInterval = null;
let currentScreen = "homeScreen";

const $ = (id) => document.getElementById(id);

function setText(id, value, fallback = "Not provided") {
    const element = $(id);

    if (element) {
        element.textContent =
            value !== null && value !== undefined && String(value).trim() !== ""
                ? String(value)
                : fallback;
    }
}

function formatDate(value) {
    if (!value) return "Not provided";

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
    if (value === null || value === undefined || value === "") {
        return "Not recorded";
    }

    const amount = Number(value);

    if (!Number.isFinite(amount)) return "Not recorded";

    return amount.toLocaleString("en-GB", {
        style: "currency",
        currency: "GBP"
    });
}

function firstAvailable(...values) {
    for (const value of values) {
        if (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        ) {
            return value;
        }
    }

    return "Not provided";
}

function getPolicyExpiry(policy) {
    return policy?.expiry_time || policy?.end_date || null;
}

function getPolicyStart(policy) {
    return policy?.start_time || policy?.start_date || null;
}

function isPolicyActive(policy) {
    if (String(policy?.status || "").toUpperCase() !== "ACTIVE") {
        return false;
    }

    const expiryValue = getPolicyExpiry(policy);

    // If there is no expiry date, retain the ACTIVE database status.
    if (!expiryValue) return true;

    const expiry = new Date(expiryValue).getTime();

    return Number.isFinite(expiry) && expiry > Date.now();
}

function getRecordedAmount(policy) {
    return policy?.amount_paid !== null &&
        policy?.amount_paid !== undefined
        ? policy.amount_paid
        : policy?.price;
}

// ==========================================
// AUTHENTICATION AND INITIAL LOAD
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
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
            loadPolicies(currentUser.id)
        ]);

        bindNavigation();
        bindPolicyButtons();
        bindLogout();

        window.setInterval(refreshPolicyStatus, 60000);

    } catch (error) {
        console.error("Portal initialisation failed:", error);
    }
});

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
// SCREEN NAVIGATION
// ==========================================

function showScreen(screenId) {
    const allowedScreens = [
        "homeScreen",
        "detailsScreen",
        "profileScreen",
        "faqScreen"
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
    document.querySelectorAll(".bottom-nav [data-screen]").forEach((button) => {
        button.addEventListener("click", () => {
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

    setText("profileEmail", user.email);

    setText(
        "profileName",
        firstAvailable(
            metadata.full_name,
            metadata.name,
            metadata.first_name
        )
    );

    setText("profileAddress", metadata.address);
    setText("profileLicence", metadata.driving_licence);
    setText("profilePhone", metadata.phone);

    setText(
        "profileDob",
        firstAvailable(metadata.date_of_birth, metadata.dob)
    );

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

        setText(
            "profileLicence",
            firstAvailable(
                profile.driving_licence,
                profile.driving_licence_number
            )
        );

        setText("profilePhone", profile.phone);

        setText(
            "profileDob",
            firstAvailable(
                profile.date_of_birth,
                profile.dob,
                profile.dob_date
            )
        );

        setText("profileOccupation", profile.occupation);
    }

    setProfileWelcome();
}

function setProfileWelcome() {
    const name = $("profileName")?.textContent || "Your account";

    setText("profileWelcomeName", name);

    const avatar = $("profileAvatar");

    if (avatar) {
        const initials = name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part.charAt(0).toUpperCase())
            .join("");

        avatar.textContent = initials || "TC";
    }
}

// ==========================================
// LOAD ALL CUSTOMER POLICIES
// ==========================================

async function loadPolicies(userId) {
    const { data, error } = await supabaseClient
        .from("policies")
        .select("*")
        .eq("user_id", userId)
        .order("expiry_time", { ascending: false });

    if (error) {
        console.error("Could not load customer policies:", error);

        currentPolicy = null;
        allPolicies = [];

        showNoActivePolicy();
        renderPastPolicies([]);

        return;
    }

    allPolicies = Array.isArray(data) ? data : [];

    // Sort policies with the newest expiry first.
    allPolicies.sort((a, b) => {
        const dateA = new Date(
            getPolicyExpiry(a) || getPolicyStart(a) || 0
        ).getTime();

        const dateB = new Date(
            getPolicyExpiry(b) || getPolicyStart(b) || 0
        ).getTime();

        return dateB - dateA;
    });

    // Find every policy that is currently active.
    const activePolicies = allPolicies.filter(isPolicyActive);

    // Use the active policy with the latest expiry for the main dashboard card.
    currentPolicy = activePolicies.length ? activePolicies[0] : null;

    window.currentPolicy = currentPolicy;

    updatePolicyCounts(activePolicies.length);

    if (currentPolicy) {
        displayActivePolicy(currentPolicy);
    } else {
        showNoActivePolicy();
    }

    // Everything that is not currently active goes into Past Policies.
    const pastPolicies = allPolicies.filter(policy => !isPolicyActive(policy));

    renderPastPolicies(pastPolicies);
}

function updatePolicyCounts(activeCount) {
    setText("activePolicyCount", String(activeCount));

    setText(
        "vehicleCount",
        `${activeCount} active`
    );
}

// ==========================================
// DISPLAY ACTIVE POLICY
// ==========================================

function displayActivePolicy(data) {
    const recordedAmount = getRecordedAmount(data);

    setText("vehicleRegistration", data.registration);

    setText(
        "vehicleName",
        [data.make, data.model].filter(Boolean).join(" ")
    );

    setText(
        "vehicleDetails",
        [data.colour, data.year].filter(Boolean).join(" ")
    );

    setText("coverType", data.cover_type || "Cover details");

    setText(
        "policyPrice",
        formatMoney(recordedAmount),
        "Not recorded"
    );

    setText("paymentStatusText", "Amount recorded on your policy");

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
    setText("detailPolicyStatus", "ACTIVE");

    setText(
        "detailStartDate",
        formatDate(getPolicyStart(data))
    );

    setText(
        "detailExpiryDate",
        formatDate(getPolicyExpiry(data))
    );

    setText(
        "detailPrice",
        formatMoney(recordedAmount),
        "Not recorded"
    );

    if ($("activePolicyCard")) {
        $("activePolicyCard").hidden = false;
    }

    if ($("noActivePolicy")) {
        $("noActivePolicy").hidden = true;
    }

    startCountdown(
        getPolicyExpiry(data),
        getPolicyStart(data)
    );

    updatePolicyBadge(getPolicyExpiry(data));
}

function showNoActivePolicy() {
    if ($("activePolicyCard")) {
        $("activePolicyCard").hidden = true;
    }

    if ($("noActivePolicy")) {
        $("noActivePolicy").hidden = false;
    }

    setText("timeRemaining", "No active policy");

    stopCountdown();
}

function updatePolicyBadge(expiryTime) {
    const badge = $("policyStatusBadge");

    if (!badge) return;

    const expired =
        expiryTime &&
        new Date(expiryTime).getTime() <= Date.now();

    badge.replaceChildren();

    const dot = document.createElement("span");

    dot.className = "status-dot";

    if (expired) {
        dot.style.background = "#ffd0d0";

        badge.append(
            dot,
            document.createTextNode(" EXPIRED")
        );
    } else {
        badge.append(
            dot,
            document.createTextNode(" ACTIVE")
        );
    }
}

// ==========================================
// PAST POLICIES
// ==========================================

function renderPastPolicies(policies) {
    const section = $("pastPoliciesSection");
    const list = $("pastPoliciesList");

    if (!section || !list) {
        console.warn(
            "Past Policies section not found. Check dashboard.html IDs."
        );
        return;
    }

    list.replaceChildren();

    setText("pastPolicyCount", String(policies.length));

    if (!policies.length) {
        section.hidden = true;
        return;
    }

    section.hidden = false;

    policies.forEach((policy) => {
        const card = document.createElement("div");

        card.className = "past-policy-card";

        const vehicleName = [
            policy.make,
            policy.model
        ].filter(Boolean).join(" ") || "Vehicle details unavailable";

        const registration = policy.registration || "Registration unavailable";

        const amount = formatMoney(getRecordedAmount(policy));

        const startDate = formatDate(getPolicyStart(policy));

        const expiryDate = formatDate(getPolicyExpiry(policy));

        const policyNumber = policy.policy_number || "Not provided";

        const details = document.createElement("div");
        details.className = "past-policy-information";

        const title = document.createElement("h3");
        title.textContent = vehicleName;

        const registrationText = document.createElement("p");
        registrationText.textContent = `Registration: ${registration}`;

        const numberText = document.createElement("p");
        numberText.textContent = `Policy number: ${policyNumber}`;

        const datesText = document.createElement("p");
        datesText.textContent = `Cover dates: ${startDate} – ${expiryDate}`;

        const amountText = document.createElement("p");
        amountText.textContent = `Amount paid: ${amount}`;

        const status = document.createElement("span");
        status.className = "past-policy-status";
        status.textContent = "EXPIRED";

        details.append(
            title,
            registrationText,
            numberText,
            datesText,
            amountText,
            status
        );

        const actions = document.createElement("div");
        actions.className = "past-policy-actions";

        const detailsButton = document.createElement("button");
        detailsButton.type = "button";
        detailsButton.className = "past-policy-details-button";
        detailsButton.textContent = "View details";

        detailsButton.addEventListener("click", () => {
            displayPolicyDetails(policy, true);
            showScreen("detailsScreen");
        });

        actions.append(detailsButton);

        // Only show the certificate button if a certificate is recorded.
        if (policy.certificate_url) {
            const certificateButton = document.createElement("button");

            certificateButton.type = "button";
            certificateButton.className = "past-policy-certificate-button";
            certificateButton.textContent = "View certificate";

            certificateButton.addEventListener("click", () => {
                openCertificate(policy);
            });

            actions.append(certificateButton);
        }

        card.append(details, actions);

        list.append(card);
    });
}

// ==========================================
// POLICY DETAILS
// ==========================================

function displayPolicyDetails(policy, historical = false) {
    if (!policy) return;

    const recordedAmount = getRecordedAmount(policy);

    setText("detailRegistration", policy.registration);

    setText(
        "detailVehicle",
        [
            policy.make,
            policy.model,
            policy.colour,
            policy.year
        ]
            .filter(value =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
            )
            .join(" ")
    );

    setText("detailCoverType", policy.cover_type);
    setText("detailPolicyNumber", policy.policy_number);

    const expired = historical || !isPolicyActive(policy);

    setText(
        "detailPolicyStatus",
        expired ? "EXPIRED" : "ACTIVE"
    );

    setText(
        "detailStartDate",
        formatDate(getPolicyStart(policy))
    );

    setText(
        "detailExpiryDate",
        formatDate(getPolicyExpiry(policy))
    );

    setText(
        "detailPrice",
        formatMoney(recordedAmount),
        "Not recorded"
    );

    // Keep track of the policy currently being viewed.
    currentPolicy = policy;
    window.currentPolicy = policy;

    const certificateButton = $("detailsCertificateButton");

    if (certificateButton) {
        certificateButton.hidden = !policy.certificate_url;
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

        const start = startTime
            ? new Date(startTime).getTime()
            : NaN;

        const remaining = expiry - Date.now();

        if (!Number.isFinite(expiry)) {
            setText("timeRemaining", "Expiry time unavailable");
            stopCountdown();
            return;
        }

        if (remaining <= 0) {
            setText("timeRemaining", "Policy expired");
            updatePolicyBadge(expiryTime);

            // Reload policies so the expired policy moves into Past Policies.
            stopCountdown();

            loadPolicies(currentUser.id).catch(error => {
                console.error("Could not refresh expired policy:", error);
            });

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

        let countdownText;

        if (isWeekOrLonger || days > 0) {
            countdownText = `${days}d ${hours}h ${minutes}m remaining`;
        } else {
            countdownText = `${hours}h ${minutes}m remaining`;
        }

        setText("timeRemaining", countdownText);
    }

    updateCountdown();

    countdownInterval = setInterval(updateCountdown, 60000);
}

// ==========================================
// POLICY BUTTONS AND CERTIFICATES
// ==========================================

function bindPolicyButtons() {
    $("viewDetails")?.addEventListener("click", () => {
        if (currentPolicy && isPolicyActive(currentPolicy)) {
            displayPolicyDetails(currentPolicy, false);
            showScreen("detailsScreen");
        } else {
            alert("No active policy is available to view.");
        }
    });

    $("viewCertificateButton")?.addEventListener("click", () => {
        if (currentPolicy) {
            openCertificate(currentPolicy);
        } else {
            alert("No active policy certificate was found.");
        }
    });

    $("detailsCertificateButton")?.addEventListener("click", () => {
        if (currentPolicy) {
            openCertificate(currentPolicy);
        }
    });
}

async function openCertificate(policy = currentPolicy) {
    try {
        if (!policy) {
            alert("No policy certificate was found.");
            return;
        }

        const { data: authData, error: authError } =
            await supabaseClient.auth.getUser();

        if (authError || !authData?.user) {
            alert("Your session has expired. Please sign in again.");

            window.location.href = "login.html";
            return;
        }

        // Security check: only allow certificates belonging to this customer.
        if (policy.user_id !== authData.user.id) {
            alert("You do not have permission to view this policy.");
            return;
        }

        sessionStorage.setItem(
            "certificateData",
            JSON.stringify(policy)
        );

        window.location.href = "certificate.html";

    } catch (error) {
        console.error("Could not open certificate:", error);

        alert("We couldn't open your certificate. Please try again.");
    }
}

// Keep support for existing inline certificate buttons.
window.openCertificate = openCertificate;

// ==========================================
// REFRESH POLICY STATUS
// ==========================================

async function refreshPolicyStatus() {
    if (!currentUser) return;

    try {
        await loadPolicies(currentUser.id);
    } catch (error) {
        console.error("Policy status refresh failed:", error);
    }
}

// ==========================================
// LOGOUT
// ==========================================

function bindLogout() {
    $("logoutButton")?.addEventListener("click", async () => {
        const button = $("logoutButton");

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
