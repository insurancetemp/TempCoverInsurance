
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
let displayedPolicy = null;
let allPolicies = [];
let countdownInterval = null;
let currentScreen = "homeScreen";

const $ = (id) => document.getElementById(id);

// ==========================================
// GENERAL HELPERS
// ==========================================

function setText(id, value, fallback = "Not provided") {
    const element = $(id);

    if (element) {
        element.textContent =
            value !== null && value !== undefined && String(value).trim() !== ""
                ? String(value)
                : fallback;
    }
}

// Format date of birth as DD/MM/YYYY.
// Handles Supabase DATE values without timezone shifts.
function formatDateOfBirth(value) {
    if (!value) return "Not provided";

    const dateString = String(value).trim();

    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not provided";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
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

function formatShortDate(value) {
    if (!value) return "Not provided";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not provided";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
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
        formatDateOfBirth(
            firstAvailable(metadata.date_of_birth, metadata.dob)
        )
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
            formatDateOfBirth(
                firstAvailable(
                    profile.date_of_birth,
                    profile.dob,
                    profile.dob_date,
                    metadata.date_of_birth,
                    metadata.dob
                )
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
        displayedPolicy = null;
        allPolicies = [];

        showNoActivePolicy();
        renderPastPolicies([]);

        return;
    }

    allPolicies = Array.isArray(data) ? data : [];

    allPolicies.sort((a, b) => {
        const dateA = new Date(
            getPolicyExpiry(a) || getPolicyStart(a) || 0
        ).getTime();

        const dateB = new Date(
            getPolicyExpiry(b) || getPolicyStart(b) || 0
        ).getTime();

        return dateB - dateA;
    });

    const activePolicies = allPolicies.filter(isPolicyActive);

    currentPolicy = activePolicies.length ? activePolicies[0] : null;

    window.currentPolicy = currentPolicy;

    updatePolicyCounts(activePolicies.length);

    if (currentPolicy) {
        displayActivePolicy(currentPolicy);
    } else {
        showNoActivePolicy();
    }

    const pastPolicies = allPolicies.filter(
        policy => !isPolicyActive(policy)
    );

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

    // Individual vehicle and policy details
    setText("detailRegistration", data.registration);
    setText("detailMake", data.make);
    setText("detailModel", data.model);
    setText("detailYear", data.year);
    setText("detailColour", data.colour);
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
// PROFESSIONAL PAST POLICIES DESIGN
// ==========================================

function addPastPolicyStyles() {
    if ($("professionalPastPolicyStyles")) return;

    const style = document.createElement("style");

    style.id = "professionalPastPolicyStyles";

    style.textContent = `
        .past-policy-card {
            position: relative;
            display: block;
            width: 100%;
            box-sizing: border-box;
            background: #ffffff;
            border: 1px solid #e9e9e9;
            border-radius: 16px;
            padding: 19px;
            margin-bottom: 16px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.045);
            overflow: hidden;
        }

        .past-policy-card::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: #ff7a00;
        }

        .past-policy-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
        }

        .past-policy-vehicle {
            flex: 1;
            min-width: 0;
        }

        .past-policy-vehicle h3 {
            margin: 0 0 5px;
            color: #202020;
            font-size: 19px;
            line-height: 1.25;
            font-weight: 800;
            letter-spacing: 0.3px;
            text-transform: uppercase;
            overflow-wrap: anywhere;
        }

        .past-policy-subtitle {
            margin: 0;
            color: #888888;
            font-size: 12px;
            font-weight: 500;
        }

        .past-policy-status {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            padding: 7px 11px;
            border-radius: 30px;
            background: #fff0f0;
            border: 1px solid #ffdada;
            color: #d43b3b;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.6px;
            white-space: nowrap;
        }

        .past-policy-registration {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-top: 15px;
            min-width: 105px;
            min-height: 32px;
            padding: 5px 12px;
            box-sizing: border-box;
            background: #f8d84e;
            border: 2px solid #222222;
            border-radius: 5px;
            color: #171717;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 1.2px;
        }

        .past-policy-dates {
            margin-top: 17px;
            padding: 13px 14px;
            background: #f7f8fa;
            border: 1px solid #eeeeee;
            border-radius: 10px;
        }

        .past-policy-label {
            display: block;
            margin-bottom: 5px;
            color: #999999;
            font-size: 9px;
            line-height: 1.4;
            font-weight: 800;
            letter-spacing: 0.9px;
        }

        .past-policy-date-value {
            display: block;
            color: #292929;
            font-size: 13px;
            line-height: 1.5;
            font-weight: 700;
        }

        .past-policy-bottom {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-top: 16px;
            padding-top: 15px;
            border-top: 1px solid #eeeeee;
        }

        .past-policy-number {
            flex: 1;
            min-width: 0;
        }

        .past-policy-number strong {
            display: block;
            color: #252525;
            font-size: 12px;
            line-height: 1.5;
            font-weight: 800;
            overflow-wrap: anywhere;
        }

        .past-policy-cover {
            max-width: 48%;
            color: #292929;
            font-size: 11px;
            line-height: 1.5;
            font-weight: 800;
            text-align: right;
        }

        .past-policy-cover strong {
            display: block;
            overflow-wrap: anywhere;
        }

        .past-policy-amount {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-top: 13px;
            color: #888888;
            font-size: 11px;
        }

        .past-policy-amount strong {
            color: #333333;
            font-size: 12px;
        }

        .past-policy-actions {
            display: flex;
            gap: 9px;
            margin-top: 17px;
        }

        .past-policy-actions button {
            flex: 1;
            min-width: 0;
            border-radius: 9px;
            padding: 11px 8px;
            font-family: inherit;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .past-policy-actions button:active {
            transform: scale(0.98);
        }

        .past-policy-details-button {
            background: #ffffff;
            color: #333333;
            border: 1px solid #dedede;
        }

        .past-policy-certificate-button {
            background: #ff7a00;
            color: #ffffff;
            border: 1px solid #ff7a00;
        }

        .past-policy-actions button:hover {
            opacity: 0.85;
        }

        @media (max-width: 380px) {
            .past-policy-card {
                padding: 15px;
            }

            .past-policy-vehicle h3 {
                font-size: 16px;
            }

            .past-policy-status {
                padding: 6px 8px;
                font-size: 9px;
            }

            .past-policy-bottom {
                gap: 8px;
            }

            .past-policy-cover {
                max-width: 46%;
                font-size: 10px;
            }

            .past-policy-number strong {
                font-size: 11px;
            }
        }
    `;

    document.head.appendChild(style);
}

function renderPastPolicies(policies) {
    const section = $("pastPoliciesSection");
    const list = $("pastPoliciesList");

    if (!section || !list) {
        console.warn(
            "Past Policies section not found. Check dashboard.html IDs."
        );
        return;
    }

    addPastPolicyStyles();

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

        const colour = policy.colour || "Colour not provided";
        const year = policy.year || "";

        const vehicleSubtitle = year
            ? `${colour} • ${year}`
            : colour;

        const registration =
            policy.registration || "NOT PROVIDED";

        const startDate = formatShortDate(getPolicyStart(policy));
        const expiryDate = formatShortDate(getPolicyExpiry(policy));

        const policyNumber =
            policy.policy_number || "Not provided";

        const coverType =
            policy.cover_type || "Fully Comprehensive";

        const amount = formatMoney(getRecordedAmount(policy));

        const header = document.createElement("div");
        header.className = "past-policy-header";

        const vehicle = document.createElement("div");
        vehicle.className = "past-policy-vehicle";

        const title = document.createElement("h3");
        title.textContent = vehicleName;

        const subtitle = document.createElement("p");
        subtitle.className = "past-policy-subtitle";
        subtitle.textContent = vehicleSubtitle;

        vehicle.append(title, subtitle);

        const status = document.createElement("span");
        status.className = "past-policy-status";
        status.textContent = "EXPIRED";

        header.append(vehicle, status);

        const plate = document.createElement("div");
        plate.className = "past-policy-registration";
        plate.textContent = registration;

        const dates = document.createElement("div");
        dates.className = "past-policy-dates";

        const datesLabel = document.createElement("span");
        datesLabel.className = "past-policy-label";
        datesLabel.textContent = "POLICY COVER PERIOD";

        const datesValue = document.createElement("span");
        datesValue.className = "past-policy-date-value";
        datesValue.textContent = `${startDate} – ${expiryDate}`;

        dates.append(datesLabel, datesValue);

        const bottom = document.createElement("div");
        bottom.className = "past-policy-bottom";

        const number = document.createElement("div");
        number.className = "past-policy-number";

        const numberLabel = document.createElement("span");
        numberLabel.className = "past-policy-label";
        numberLabel.textContent = "POLICY NUMBER";

        const numberValue = document.createElement("strong");
        numberValue.textContent = policyNumber;

        number.append(numberLabel, numberValue);

        const cover = document.createElement("div");
        cover.className = "past-policy-cover";

        const coverLabel = document.createElement("span");
        coverLabel.className = "past-policy-label";
        coverLabel.textContent = "COVER TYPE";

        const coverValue = document.createElement("strong");
        coverValue.textContent = coverType.toUpperCase();

        cover.append(coverLabel, coverValue);

        bottom.append(number, cover);

        const amountRow = document.createElement("div");
        amountRow.className = "past-policy-amount";

        const amountLabel = document.createElement("span");
        amountLabel.textContent = "Amount paid";

        const amountValue = document.createElement("strong");
        amountValue.textContent = amount;

        amountRow.append(amountLabel, amountValue);

        const actions = document.createElement("div");
        actions.className = "past-policy-actions";

        const detailsButton = document.createElement("button");
        detailsButton.type = "button";
        detailsButton.className = "past-policy-details-button";
        detailsButton.textContent = "View policy details";

        detailsButton.addEventListener("click", () => {
            displayPolicyDetails(policy, true);
            showScreen("detailsScreen");
        });

        actions.append(detailsButton);

        if (policy.certificate_url) {
            const certificateButton = document.createElement("button");

            certificateButton.type = "button";
            certificateButton.className =
                "past-policy-certificate-button";

            certificateButton.textContent = "View certificate";

            certificateButton.addEventListener("click", () => {
                openCertificate(policy);
            });

            actions.append(certificateButton);
        }

        card.append(
            header,
            plate,
            dates,
            bottom,
            amountRow,
            actions
        );

        list.append(card);
    });
}

// ==========================================
// POLICY DETAILS
// ==========================================

function displayPolicyDetails(policy, historical = false) {
    if (!policy) return;

    const recordedAmount = getRecordedAmount(policy);

    // Keep track of the policy currently being viewed.
    // This is separate from the customer's active policy.
    displayedPolicy = policy;

    // Individual vehicle details
    setText("detailRegistration", policy.registration);
    setText("detailMake", policy.make);
    setText("detailModel", policy.model);
    setText("detailYear", policy.year);
    setText("detailColour", policy.colour);

    // Policy information
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
        if (displayedPolicy) {
            openCertificate(displayedPolicy);
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
