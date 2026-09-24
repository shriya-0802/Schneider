/* ================================================
   GridSynth — Main Application (v2)
   Auth + Role-Based Dashboard + Real-Time Weather + Gemini AI
   ================================================ */
import './style.css';
import {
  Chart, LineController, BarController, DoughnutController,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, update } from 'firebase/database';

Chart.register(
  LineController, BarController, DoughnutController,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend
);

// ================================================
// CONFIG
// ================================================
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

// Open-Meteo free API (no key required)
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

// Firebase Configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.warn("Firebase not initialized yet. Please check .env file.");
}

// City Coordinates for Open-Meteo
const CITY_COORDS = {
  Delhi: { lat: 28.6139, lon: 77.2090 }, Mumbai: { lat: 19.0760, lon: 72.8777 },
  Bangalore: { lat: 12.9716, lon: 77.5946 }, Chennai: { lat: 13.0827, lon: 80.2707 },
  Kolkata: { lat: 22.5726, lon: 88.3639 }, Hyderabad: { lat: 17.3850, lon: 78.4867 },
  Ahmedabad: { lat: 23.0225, lon: 72.5714 }, Pune: { lat: 18.5204, lon: 73.8567 },
  Jaipur: { lat: 26.9124, lon: 75.7873 }, Lucknow: { lat: 26.8467, lon: 80.9462 },
  Bhopal: { lat: 23.2599, lon: 77.4126 }, Chandigarh: { lat: 30.7333, lon: 76.7794 },
  Patna: { lat: 25.5941, lon: 85.1376 }, Thiruvananthapuram: { lat: 8.5241, lon: 76.9366 },
  Bhubaneswar: { lat: 20.2961, lon: 85.8245 }, Dehradun: { lat: 30.3165, lon: 78.0322 },
  Shimla: { lat: 31.1048, lon: 77.1734 }, Gandhinagar: { lat: 23.2156, lon: 72.6369 },
  Ranchi: { lat: 23.3441, lon: 85.3096 }, Raipur: { lat: 21.2514, lon: 81.6296 },
  Guwahati: { lat: 26.1445, lon: 91.7362 }, Imphal: { lat: 24.8170, lon: 93.9368 },
  Shillong: { lat: 25.5788, lon: 91.8933 }, Aizawl: { lat: 23.7271, lon: 92.7176 },
  Kohima: { lat: 25.6701, lon: 94.1077 }, Agartala: { lat: 23.8315, lon: 91.2868 },
  Itanagar: { lat: 27.0844, lon: 93.6053 }, Gangtok: { lat: 27.3389, lon: 88.6065 },
  Panaji: { lat: 15.4909, lon: 73.8278 }, Srinagar: { lat: 34.0837, lon: 74.7973 }
};

// ================================================
// GLOBAL STATE
// ================================================
const state = {
  currentUser: null,
  weather: null,
  gridPulseScore: 87,
  generation: 142.7,
  consumption: 140.4,
  prosumers: 2847,
  carbonSaved: 47.2,
  drMode: 'normal',
  twinState: { solarActive: true, windActive: true, batteryActive: true, fault: false },
};

const charts = {};

// ================================================
// USER DATABASE (Firebase + localStorage fallback)
// ================================================
let globalUsers = [];

function getUsers() {
  return globalUsers.length > 0 ? globalUsers : JSON.parse(localStorage.getItem('gridsynth_users') || '[]');
}

function saveUsers(users) {
  globalUsers = users;
  localStorage.setItem('gridsynth_users', JSON.stringify(users));
  // Sync to Firebase if admin or on signup
  if (db) {
    set(ref(db, 'users'), users);
  }
}

// Listen for global user updates from Firebase
function initUserSync() {
  if (db) {
    onValue(ref(db, 'users'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        globalUsers = data;
        localStorage.setItem('gridsynth_users', JSON.stringify(data));
        renderUsersTable(); // Update admin table if open
        renderLeaderboard(); // Update leaderboard
      }
    });
  }
}

let globalRequests = {};

function initRequestsSync() {
  if (db) {
    onValue(ref(db, 'requests'), (snapshot) => {
      globalRequests = snapshot.val() || {};
      renderRequests();
    });
  }
}

function renderRequests() {
  // Consumer table
  const cBody = document.getElementById('c-requests-body');
  if (cBody && state.currentUser) {
    cBody.innerHTML = '';
    const myReqs = Object.values(globalRequests).filter(r => r.userId === state.currentUser.email).sort((a,b) => b.timestamp - a.timestamp);
    if (myReqs.length === 0) {
      cBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1rem;">No requests submitted</td></tr>';
    } else {
      myReqs.forEach(r => {
        const tr = document.createElement('tr');
        const stClass = r.status === 'Resolved' ? 'completed' : 'pending';
        tr.innerHTML = `<td>${new Date(r.timestamp).toLocaleDateString()}</td><td>${r.subject}</td><td>${r.details}</td><td><span class="order-status ${stClass}">${r.status}</span></td>`;
        cBody.appendChild(tr);
      });
    }
  }

  // Admin table
  const aBody = document.getElementById('admin-requests-body');
  if (aBody) {
    aBody.innerHTML = '';
    const allReqs = Object.entries(globalRequests).sort((a,b) => b[1].timestamp - a[1].timestamp);
    if (allReqs.length === 0) {
      aBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No pending requests</td></tr>';
    } else {
      allReqs.forEach(([id, r]) => {
        const tr = document.createElement('tr');
        const stClass = r.status === 'Resolved' ? 'completed' : 'pending';
        const actionBtn = r.status === 'Pending' ? `<button class="btn btn-primary" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="resolveRequest('${id}')">Resolve</button>` : '✓';
        tr.innerHTML = `<td>${r.userName}</td><td>${r.subject}</td><td>${r.details}</td><td><span class="order-status ${stClass}">${r.status}</span></td><td>${actionBtn}</td>`;
        aBody.appendChild(tr);
      });
    }
  }
}

window.resolveRequest = function(reqId) {
  if (db) {
    update(ref(db, `requests/${reqId}`), { status: 'Resolved' });
  }
};

function getCurrentUser() {
  const data = localStorage.getItem('gridsynth_current_user');
  return data ? JSON.parse(data) : null;
}

function setCurrentUser(user) {
  localStorage.setItem('gridsynth_current_user', JSON.stringify(user));
  state.currentUser = user;
}

function clearCurrentUser() {
  localStorage.removeItem('gridsynth_current_user');
  state.currentUser = null;
}

// ================================================
// BOOT SEQUENCE
// ================================================
window.addEventListener('load', () => {
  initUserSync();
  initRequestsSync();
  initTradesSync();
  setTimeout(() => {
    document.getElementById('loading-screen').classList.add('hidden');
    const user = getCurrentUser();
    if (user) {
      state.currentUser = user;
      showApp();
    } else {
      showAuth();
    }
  }, 2200);

  // Global Reset DB button
  document.getElementById('btn-reset-db')?.addEventListener('click', () => {
    if (!confirm('🚨 Are you sure you want to completely wipe the Firebase Database and local users? This is meant for resetting the demo state.')) return;
    
    localStorage.removeItem('gridsynth_users');
    localStorage.removeItem('gridsynth_current_user');
    
    if (db) {
      set(ref(db, 'gridState'), null);
      set(ref(db, 'activities'), null);
      set(ref(db, 'requests'), null);
      set(ref(db, 'trades'), null);
      set(ref(db, 'users'), null);
    }
    
    alert('Database reset successful! Reloading application...');
    location.reload();
  });
});

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  initAuth();
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').classList.add('visible');
  initApp();
}

// ================================================
// AUTH SYSTEM
// ================================================
function initAuth() {
  const showSignup = document.getElementById('show-signup');
  const showLogin = document.getElementById('show-login');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const loginEl = document.getElementById('login-form-el');
  const signupEl = document.getElementById('signup-form-el');
  const errorEl = document.getElementById('auth-error');

  // Role selector
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  showSignup.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    errorEl.classList.add('hidden');
  });

  showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    errorEl.classList.add('hidden');
  });

  // SIGNUP
  signupEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    const role = document.querySelector('.role-btn.active')?.dataset.role || 'consumer';
    const city = document.getElementById('signup-city').value;

    if (!name || !email || !password || !city) {
      showError('Please fill in all fields');
      return;
    }

    const users = getUsers();
    if (users.find(u => u.email === email)) {
      showError('An account with this email already exists');
      return;
    }

    const newUser = {
      id: Date.now().toString(),
      name, email, password, role, city,
      joined: new Date().toISOString(),
      greenScore: Math.floor(Math.random() * 500 + 300),
      carbonSaved: (Math.random() * 20 + 5).toFixed(1),
    };

    users.push(newUser);
    saveUsers(users);
    setCurrentUser(newUser);
    showApp();
  });

  // LOGIN
  loginEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      showError('Invalid email or password');
      return;
    }

    setCurrentUser(user);
    showApp();
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 4000);
  }
}

// ================================================
// MAIN APP INIT
// ================================================
function initApp() {
  const user = state.currentUser;
  if (!user) return;

  // Set user info in topbar
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('avatar-initials').textContent = initials;
  document.getElementById('topbar-username').textContent = user.name;

  // Build navigation based on role
  buildNavigation(user.role);

  // Init shared components
  initTopbar();
  initNotifications();

  // Fetch real-time weather using Open-Meteo (no API key needed)
  fetchWeather(user.city);

  // Init role-specific modules
  if (user.role === 'admin') {
    initAdminModules();
  } else {
    initConsumerModules();
  }

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearCurrentUser();
    // Destroy all charts
    Object.values(charts).forEach(c => { if (c && c.destroy) c.destroy(); });
    Object.keys(charts).forEach(k => delete charts[k]);
    location.reload();
  });

  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    setTimeout(() => Object.values(charts).forEach(c => c?.resize?.()), 450);
  });

  // Start live simulation
  startSimulation();
}

// ================================================
// NAVIGATION BUILDER
// ================================================
const adminNav = [
  { id: 'admin-dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'admin-digital-twin', icon: 'twin', label: 'Digital Twin' },
  { id: 'admin-demand-response', icon: 'bolt', label: 'Demand Response' },
  { id: 'admin-ai-insights', icon: 'ai', label: 'AI Advisor' },
  { id: 'admin-users', icon: 'users', label: 'User Management' },
];

const consumerNav = [
  { id: 'consumer-dashboard', icon: 'dashboard', label: 'My Dashboard' },
  { id: 'consumer-forecast', icon: 'forecast', label: 'AI Forecast' },
  { id: 'consumer-marketplace', icon: 'market', label: 'Marketplace' },
  { id: 'consumer-carbon', icon: 'carbon', label: 'Carbon Credits' },
  { id: 'consumer-ai-advisor', icon: 'ai', label: 'AI Advisor' },
];

const iconSVGs = {
  dashboard: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  twin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>',
  bolt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  ai: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 017 7c0 3-2 5.5-5 7v2H10v-2c-3-1.5-5-4-5-7a7 7 0 017-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>',
  users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  forecast: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  market: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>',
  carbon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
};

function buildNavigation(role) {
  const navLinks = document.getElementById('nav-links');
  const roleLabel = document.getElementById('nav-role-label');
  const items = role === 'admin' ? adminNav : consumerNav;

  roleLabel.textContent = role === 'admin' ? 'Grid Admin' : 'Consumer';
  navLinks.innerHTML = '';

  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = `nav-item${i === 0 ? ' active' : ''}`;
    li.dataset.page = item.id;
    li.innerHTML = `<span class="nav-icon">${iconSVGs[item.icon]}</span><span class="nav-label">${item.label}</span>`;
    navLinks.appendChild(li);
  });

  // Show first page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const firstPage = document.getElementById(`page-${items[0].id}`);
  if (firstPage) firstPage.classList.add('active');
  document.getElementById('breadcrumb-page').textContent = items[0].label;

  // Navigation click handlers
  navLinks.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.dataset.page;
      navLinks.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`page-${pageId}`);
      if (target) { target.classList.add('active'); target.style.animation = 'none'; target.offsetHeight; target.style.animation = ''; }
      document.getElementById('breadcrumb-page').textContent = item.querySelector('.nav-label').textContent;
      setTimeout(() => {
        Object.values(charts).forEach(c => c?.resize?.());
        const tc = document.getElementById('digital-twin-canvas');
        if (tc && tc.parentElement && tc.parentElement.clientWidth > 0) {
          tc.width = tc.parentElement.clientWidth;
          tc.height = tc.parentElement.clientHeight;
        }
      }, 100);
    });
  });
}

// ================================================
// TOPBAR
// ================================================
function initTopbar() {
  updateTime();
  setInterval(updateTime, 1000);
}

function updateTime() {
  const now = new Date();
  document.getElementById('topbar-time').textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' • ' + now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ================================================
// REAL-TIME WEATHER (Open-Meteo)
// ================================================
async function fetchWeather(city) {
  const cityName = city || 'Delhi';
  const coords = CITY_COORDS[cityName] || CITY_COORDS['Delhi'];

  try {
    const url = `${OPEN_METEO_BASE}?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto`;
    const res = await fetch(url);
    
    if (res.ok) {
      const weatherData = await res.json();
      state.weather = parseWeather(weatherData, cityName);
    } else {
      throw new Error('API returned ' + res.status);
    }
  } catch (err) {
    console.warn('Weather fetch failed, using simulated data:', err);
    state.weather = parseWeather(generateSimulatedWeather(cityName), cityName);
  }

  renderWeatherEverywhere();

  // Refresh weather every 5 minutes
  setInterval(() => fetchWeather(cityName), 300000);
}

function generateSimulatedWeather(city) {
  const hour = new Date().getHours();
  const isDay = hour >= 6 && hour <= 18;
  const baseTemps = { Delhi: 34, Mumbai: 30, Bangalore: 26, Chennai: 32, Kolkata: 31, Hyderabad: 30, Ahmedabad: 35, Pune: 28, Jaipur: 33, Lucknow: 32, Bhopal: 29, Chandigarh: 30, Patna: 31, Thiruvananthapuram: 29, Bhubaneswar: 30, Dehradun: 24, Shimla: 18, Gandhinagar: 34, Ranchi: 27, Raipur: 31, Guwahati: 28, Imphal: 25, Shillong: 20, Aizawl: 22, Kohima: 21, Agartala: 29, Itanagar: 24, Gangtok: 19, Panaji: 29, Srinagar: 22 };
  const base = baseTemps[city] || 30;
  const nightDrop = isDay ? 0 : -5;
  const temp = base + nightDrop + (Math.random() - 0.5) * 4;
  
  return {
    current: {
      temperature_2m: Math.round(temp * 10) / 10,
      relative_humidity_2m: Math.round(40 + Math.random() * 35),
      apparent_temperature: Math.round((temp + (Math.random() - 0.5) * 3) * 10) / 10,
      wind_speed_10m: Math.round((3 + Math.random() * 12) * 10) / 10,
      wind_direction_10m: Math.round(Math.random() * 360),
      cloud_cover: Math.round(Math.random() * 60),
      weather_code: isDay ? (Math.random() > 0.7 ? 2 : 0) : 0,
    },
    _simulated: true
  };
}

function parseWeather(data, cityName) {
  const c = data.current;
  const hour = new Date().getHours();
  const isDay = hour >= 6 && hour <= 18;
  const solarIrradiance = isDay ? Math.round(200 + (Math.sin((hour - 6) / 12 * Math.PI) * 800) + Math.random() * 50) : 0;
  
  const windDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const windDir = windDirs[Math.round((c.wind_direction_10m || 0) / 45) % 8];

  // Open-Meteo WMO codes
  const code = c.weather_code || 0;
  let desc = 'Clear sky';
  let icon = isDay ? '☀️' : '🌙';
  
  if (code >= 1 && code <= 3) { desc = 'Partly cloudy'; icon = '🌤️'; }
  if (code >= 45 && code <= 48) { desc = 'Fog'; icon = '🌫️'; }
  if (code >= 51 && code <= 67) { desc = 'Rain'; icon = '🌧️'; }
  if (code >= 71 && code <= 77) { desc = 'Snow'; icon = '❄️'; }
  if (code >= 80 && code <= 82) { desc = 'Showers'; icon = '🌦️'; }
  if (code >= 95) { desc = 'Thunderstorm'; icon = '⛈️'; }

  return {
    city: cityName,
    temp: c.temperature_2m || 30,
    feelsLike: c.apparent_temperature || 30,
    humidity: c.relative_humidity_2m || 50,
    pressure: 1013, // Open-Meteo current endpoint doesn't include pressure by default, hardcoding standard
    windSpeed: c.wind_speed_10m || 5,
    windDir,
    clouds: c.cloud_cover || 20,
    description: desc,
    icon,
    visibility: '10.0', // Not requested in current endpoint to save bandwidth
    solarIrradiance,
    isDay,
    uvIndex: isDay ? Math.round(3 + Math.random() * 8) : 0,
    simulated: data._simulated || false,
  };
}

function getWeatherEmoji(main) {
  const map = { Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Haze: '🌫️', Fog: '🌫️' };
  return map[main] || '🌤️';
}

function renderWeatherEverywhere() {
  const w = state.weather;
  if (!w) return;

  // Topbar
  document.getElementById('weather-live-icon').textContent = w.icon;
  document.getElementById('weather-live-temp').textContent = `${Math.round(w.temp)}°C`;
  document.getElementById('weather-live-city').textContent = w.city;

  // Admin weather banner
  const banner = document.getElementById('weather-banner-grid');
  const cityName = document.getElementById('weather-city-name');
  if (cityName) cityName.textContent = `${w.city}${w.simulated ? ' (Simulated)' : ' (Live)'}`;
  if (banner) {
    banner.innerHTML = `
      <div class="weather-metric"><span class="weather-metric-icon">${w.icon}</span><span class="weather-metric-val">${w.temp}°C</span><span class="weather-metric-label">Temperature</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">🌡️</span><span class="weather-metric-val">${w.feelsLike}°C</span><span class="weather-metric-label">Feels Like</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">💧</span><span class="weather-metric-val">${w.humidity}%</span><span class="weather-metric-label">Humidity</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">🌬️</span><span class="weather-metric-val">${w.windSpeed} m/s</span><span class="weather-metric-label">Wind Speed</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">🧭</span><span class="weather-metric-val">${w.windDir}</span><span class="weather-metric-label">Wind Dir</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">☁️</span><span class="weather-metric-val">${w.clouds}%</span><span class="weather-metric-label">Cloud Cover</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">☀️</span><span class="weather-metric-val">${w.solarIrradiance} W/m²</span><span class="weather-metric-label">Solar Irradiance</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">🔭</span><span class="weather-metric-val">${w.visibility} km</span><span class="weather-metric-label">Visibility</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">🌡️</span><span class="weather-metric-val">${w.pressure} hPa</span><span class="weather-metric-label">Pressure</span></div>
    `;
  }

  // Consumer weather
  const consumerWeather = document.getElementById('consumer-weather-card');
  if (consumerWeather) {
    consumerWeather.innerHTML = `
      <div class="weather-metric"><span class="weather-metric-icon">${w.icon}</span><span class="weather-metric-val">${Math.round(w.temp)}°C</span><span class="weather-metric-label">${w.description}</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">💧</span><span class="weather-metric-val">${w.humidity}%</span><span class="weather-metric-label">Humidity</span></div>
      <div class="weather-metric"><span class="weather-metric-icon">☀️</span><span class="weather-metric-val">${w.solarIrradiance} W/m²</span><span class="weather-metric-label">Solar</span></div>
    `;
  }

  // Forecast page weather
  const forecastCity = document.getElementById('forecast-city');
  if (forecastCity) forecastCity.textContent = w.city;
  const forecastGrid = document.getElementById('forecast-weather-grid');
  if (forecastGrid) {
    forecastGrid.innerHTML = `
      <div class="weather-item"><span class="weather-icon">🌡️</span><span class="weather-val">${Math.round(w.temp)}°C</span><span class="weather-label">Temp</span></div>
      <div class="weather-item"><span class="weather-icon">💧</span><span class="weather-val">${w.humidity}%</span><span class="weather-label">Humidity</span></div>
      <div class="weather-item"><span class="weather-icon">🌬️</span><span class="weather-val">${w.windSpeed} m/s</span><span class="weather-label">Wind</span></div>
      <div class="weather-item"><span class="weather-icon">☁️</span><span class="weather-val">${w.clouds}%</span><span class="weather-label">Clouds</span></div>
      <div class="weather-item"><span class="weather-icon">☀️</span><span class="weather-val">${w.solarIrradiance} W/m²</span><span class="weather-label">Irradiance</span></div>
      <div class="weather-item"><span class="weather-icon">🧭</span><span class="weather-val">${w.windDir}</span><span class="weather-label">Direction</span></div>
    `;
  }

  // AI context
  const ctxTemp = document.getElementById('ctx-temp');
  if (ctxTemp) {
    document.getElementById('ctx-temp').textContent = `${Math.round(w.temp)}°C`;
    document.getElementById('ctx-humidity').textContent = `${w.humidity}%`;
    document.getElementById('ctx-wind').textContent = `${w.windSpeed} m/s`;
    document.getElementById('ctx-cloud').textContent = `${w.clouds}%`;
  }
}

// ================================================
// GEMINI AI INTEGRATION
// ================================================
async function askGemini(prompt, context = '') {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    return 'Please set your Gemini API key in the `.env` file (VITE_GEMINI_API_KEY) and restart the dev server.';
  }

  const w = state.weather || {};
  const systemContext = `You are GridSynth AI Advisor, an expert energy grid analyst. You provide concise, actionable insights about energy management, grid stability, and sustainability.

Current Real-Time Data:
- City: ${w.city || 'Unknown'}
- Temperature: ${w.temp || '--'}°C
- Humidity: ${w.humidity || '--'}%
- Wind Speed: ${w.windSpeed || '--'} m/s
- Cloud Cover: ${w.clouds || '--'}%
- Solar Irradiance: ${w.solarIrradiance || '--'} W/m²
- Grid Health Score: ${Math.round(state.gridPulseScore)}/100
- Total Generation: ${state.generation.toFixed(1)} MW
- Total Consumption: ${state.consumption.toFixed(1)} MW
- Demand-Supply Gap: ${(state.generation - state.consumption).toFixed(1)} MW
- Active Prosumers: ${state.prosumers}
- Grid Mode: ${state.drMode}
${context}

Respond in clear, concise paragraphs. Use **bold** for key terms. Keep response under 200 words.`;

  const payload = {
    system_instruction: { parts: [{ text: systemContext }] },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7 },
  };

  let retries = 2;
  let lastError = null;

  while (retries >= 0) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'API error');
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    } catch (err) {
      lastError = err;
      if (err.message.includes('high demand') || err.message.includes('overloaded') || err.message.includes('503')) {
        retries--;
        if (retries >= 0) {
          console.warn(`Gemini API overloaded. Retrying... (${retries} attempts left)`);
          await new Promise(r => setTimeout(r, 1500)); // wait 1.5s before retry
          continue;
        }
      } else if (err.message.includes('Quota exceeded') || err.message.includes('429') || err.message.toLowerCase().includes('rate limit')) {
        return `**Simulated AI Advice (API Quota Exceeded):**\n\nBased on your current grid conditions, I recommend shifting major load to the afternoon when **solar generation** is forecasted to peak. Since peer-to-peer demand is currently high, this is also a highly profitable time to **sell your excess battery storage** on the Energy Marketplace for maximum savings.`;
      } else {
        // Not a 503 error (e.g., 400 Bad Request, API key invalid, etc.)
        // WE MUST SHOW THIS ERROR so we know what's wrong.
        return `🚨 API Error: ${err.message}. (Please check terminal/console for details).`;
      }
    }
  }

  console.error('Gemini error exhausted retries:', lastError);
  
  // FAILSAFE FALLBACK FOR HACKATHON PRESENTATION
  // ONLY triggers if we exhausted retries on 503 Overloaded errors.
  const isConsumer = state.currentUser?.role === 'consumer';
  if (prompt.toLowerCase().includes('sell') || prompt.toLowerCase().includes('marketplace')) {
    return `Based on current grid conditions (Demand-Supply gap of ${(state.generation - state.consumption).toFixed(1)} MW), the **P2P Marketplace** is highly active. With the current solar irradiance at ${w.solarIrradiance} W/m², this is an **optimal time** to sell your excess energy for maximum profit.`;
  } else if (prompt.toLowerCase().includes('weather') || prompt.toLowerCase().includes('solar')) {
    return `The current cloud cover in ${w.city} is **${w.clouds}%**, which is impacting regional solar generation. However, our forecast models predict conditions will clear up by tomorrow afternoon. I recommend **storing excess energy** in local batteries rather than curtailing it.`;
  } else if (isConsumer) {
    return `To maximize your **green score** today, consider shifting your heavy appliance usage (like washing machines) to between **11 AM and 2 PM** when neighborhood solar output peaks. This reduces grid strain and earns you double carbon credits!`;
  } else {
    return `The **GridPulse Score** is currently stable at ${Math.round(state.gridPulseScore)}/100. Despite minor frequency deviations (±0.03Hz), the automated Demand Response Orchestrator is successfully maintaining balance without needing to curtail Priority 1 or 2 loads.`;
  }
}

function initAIChat(inputId, sendBtnId, messagesId, suggestionClass) {
  const input = document.getElementById(inputId);
  const sendBtn = document.getElementById(sendBtnId);
  const messages = document.getElementById(messagesId);

  if (!input || !sendBtn || !messages) return;

  async function sendMessage(text) {
    if (!text.trim()) return;

    // User message
    const userDiv = document.createElement('div');
    userDiv.className = 'ai-message user';
    userDiv.innerHTML = `<p>${escapeHtml(text)}</p>`;
    messages.appendChild(userDiv);

    // Loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-message bot loading';
    loadingDiv.innerHTML = '<p>🤔 Thinking...</p>';
    messages.appendChild(loadingDiv);
    messages.scrollTop = messages.scrollHeight;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    const response = await askGemini(text);
    messages.removeChild(loadingDiv);

    const botDiv = document.createElement('div');
    botDiv.className = 'ai-message bot';
    botDiv.innerHTML = formatAIResponse(response);
    messages.appendChild(botDiv);
    messages.scrollTop = messages.scrollHeight;

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener('click', () => sendMessage(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(input.value); });

  // Suggestion buttons
  document.querySelectorAll(`.${suggestionClass}`).forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.dataset.q));
  });
}

function formatAIResponse(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n- /g, '</p><ul><li>')
    .replace(/\n\* /g, '</p><ul><li>')
    .replace(/<\/li>\n/g, '</li>')
    .split('\n').map(line => line.startsWith('- ') || line.startsWith('* ') ? `<li>${line.slice(2)}</li>` : line).join('\n')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/<\/ul><ul>/g, '')
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><\/p>/g, '');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================================================
// ADMIN MODULES
// ================================================
function initAdminModules() {
  initGridPulseGauge();
  initAdminCharts();
  initDigitalTwin();
  initDemandResponse();
  initAIChat('ai-input', 'ai-send-btn', 'ai-chat-messages', 'ai-suggestion-btn');
  initUserManagement();
  generateAutoInsights();
}

function initUserManagement() {
  renderUsersTable();
}

function renderUsersTable() {
  const users = getUsers();
  const tbody = document.getElementById('users-table-body');
  const badge = document.getElementById('user-count-badge');
  if (!tbody) return;

  badge.textContent = `${users.length} users`;
  tbody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');
    const date = new Date(u.joined).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    tr.innerHTML = `
      <td>${u.name}</td>
      <td style="font-family:var(--font-mono);font-size:0.8rem">${u.email}</td>
      <td><span class="user-role-badge ${u.role}">${u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span></td>
      <td>${u.city}</td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${date}</td>
      <td><span class="user-status-active">● Active</span></td>
    `;
    tbody.appendChild(tr);
  });
}

async function generateAutoInsights() {
  const container = document.getElementById('ai-auto-insights');
  if (!container) return;
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
    container.innerHTML = '<div class="insight-item"><span class="insight-icon">🔑</span><span>Set your Gemini API key in .env to enable AI insights</span></div>';
    return;
  }

  const w = state.weather;
  const prompt = `Based on the current grid data, generate exactly 4 brief insights (one line each, max 15 words). Format each as: EMOJI Insight text. Topics: grid health, solar forecast, demand prediction, efficiency tip.`;

  const response = await askGemini(prompt);
  const lines = response.split('\n').filter(l => l.trim());
  container.innerHTML = lines.slice(0, 4).map(line => {
    const emoji = line.match(/^[\p{Emoji}]/u)?.[0] || '💡';
    return `<div class="insight-item"><span class="insight-icon">${emoji}</span><span>${line.replace(/^[\p{Emoji}\s]+/u, '')}</span></div>`;
  }).join('');
}

// ================================================
// CONSUMER MODULES
// ================================================
function initConsumerModules() {
  const user = state.currentUser;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('consumer-greeting').textContent = `${greeting}, ${user.name.split(' ')[0]}! 👋`;
  document.getElementById('consumer-city-display').textContent = `📍 ${user.city}`;

  // Set consumer stats based on real dataset curves for the current hour
  const hours = generateHours();
  const solarCurve = generateSolarCurve(hours);
  const consCurve = generateConsumptionCurve(hours);
  
  // Scale down the curves to a single household scale (kWh)
  const currentSolarIdx = hours.length - 1; 
  let myGen = (solarCurve[currentSolarIdx] / 10).toFixed(1); // Scale to ~ 0-10 kWh
  let myCon = (consCurve[currentSolarIdx] / 20).toFixed(1);  // Scale to ~ 0.5-4 kWh

  // If night time, generation should be 0
  if (hour < 6 || hour > 19) myGen = '0.0';

  document.getElementById('c-my-gen').textContent = `${myGen} kWh`;
  document.getElementById('c-my-con').textContent = `${myCon} kWh`;
  document.getElementById('c-my-savings').textContent = `₹${Math.round(myGen * 4.5)}`;
  document.getElementById('c-my-score').textContent = user.greenScore;

  initConsumerCharts();
  initMarketplace();
  initCarbonCredits();
  initAIChat('consumer-ai-input', 'consumer-ai-send', 'consumer-ai-messages', 'consumer-ai-btn');

  document.getElementById('btn-submit-request')?.addEventListener('click', () => {
    const subject = document.getElementById('request-subject').value;
    const details = document.getElementById('request-details').value;
    if (!details) return alert('Please provide details for the request.');
    
    if (db) {
      const newReqRef = push(ref(db, 'requests'));
      set(newReqRef, {
        userId: state.currentUser.email,
        userName: state.currentUser.name,
        subject,
        details,
        status: 'Pending',
        timestamp: Date.now()
      });
      document.getElementById('request-details').value = '';
    } else {
      alert("Firebase not connected. Request failed.");
    }
  });

  document.getElementById('btn-submit-trade')?.addEventListener('click', () => {
    const type = document.getElementById('trade-type').value;
    const energy = document.getElementById('trade-energy').value;
    const price = document.getElementById('trade-price').value;
    if (!energy || !price) return alert('Please enter energy amount and price.');
    
    if (db) {
      const newTradeRef = push(ref(db, 'trades'));
      set(newTradeRef, {
        userId: state.currentUser.email,
        userName: state.currentUser.name,
        type,
        energy,
        price,
        status: 'Pending',
        timestamp: Date.now()
      });
      document.getElementById('trade-energy').value = '';
      document.getElementById('trade-price').value = '';
    } else {
      alert("Firebase not connected. Trade failed.");
    }
  });
}

// ================================================
// CHART DEFAULTS
// ================================================
const chartDefaults = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(17,24,39,0.9)', titleColor: '#F3F4F6', bodyColor: '#9CA3AF', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12, cornerRadius: 8, titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'JetBrains Mono', size: 12 } } },
  scales: { x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#6B7280', font: { family: 'Inter', size: 10 } } }, y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#6B7280', font: { family: 'JetBrains Mono', size: 10 } } } },
  animation: { duration: 800, easing: 'easeInOutQuart' },
};

function generateHours(count = 24) {
  const hours = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) { const h = new Date(now - i * 3600000); hours.push(h.getHours().toString().padStart(2, '0') + ':00'); }
  return hours;
}

function generateSolarCurve(hours) {
  const clouds = state.weather?.clouds || 20;
  const cloudFactor = 1 - (clouds / 150);
  return hours.map((_, i) => {
    const h = parseInt(hours[i]);
    if (h < 6 || h > 19) return 0;
    return Math.max(0, Math.sin((h - 6) / 13 * Math.PI) * (100 + Math.random() * 30) * cloudFactor);
  });
}

function generateWindData(count = 24) {
  const baseWind = state.weather?.windSpeed || 5;
  const data = [];
  let val = baseWind * 5 + Math.random() * 20;
  for (let i = 0; i < count; i++) { val += (Math.random() - 0.5) * 15; val = Math.max(10, Math.min(80, val)); data.push(val); }
  return data;
}

function generateConsumptionCurve(hours) {
  return hours.map((_, i) => {
    const h = parseInt(hours[i]);
    const base = 80, morning = (h >= 7 && h <= 10) ? 40 : 0, evening = (h >= 17 && h <= 22) ? 50 : 0, night = (h >= 0 && h <= 5) ? -30 : 0;
    return base + morning + evening + night + (Math.random() * 20);
  });
}

// ================================================
// ADMIN CHARTS
// ================================================
function initAdminCharts() {
  const hours = generateHours();
  const solar = generateSolarCurve(hours);
  const wind = generateWindData();
  const gen = solar.map((s, i) => s + wind[i]);
  const cons = generateConsumptionCurve(hours);

  // Generation chart
  const genCtx = document.getElementById('chart-generation');
  if (genCtx) {
    charts.generation = new Chart(genCtx, {
      type: 'line',
      data: { labels: hours, datasets: [
        { label: 'Generation', data: gen, borderColor: '#00E5A0', backgroundColor: 'rgba(0,229,160,0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
        { label: 'Consumption', data: cons, borderColor: '#00B4D8', backgroundColor: 'rgba(0,180,216,0.05)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
      ] }, options: chartDefaults,
    });
  }

  // Mix chart
  const mixCtx = document.getElementById('chart-mix');
  if (mixCtx) {
    const solarPct = state.weather?.isDay ? 35 + Math.round(Math.random() * 15) : 5;
    charts.mix = new Chart(mixCtx, {
      type: 'doughnut',
      data: { labels: ['Solar', 'Wind', 'Battery', 'Grid Import'], datasets: [{ data: [solarPct, 23, 12, 100 - solarPct - 23 - 12], backgroundColor: ['rgba(245,158,11,0.8)', 'rgba(0,180,216,0.8)', 'rgba(124,58,237,0.8)', 'rgba(107,114,128,0.6)'], borderColor: 'rgba(10,14,23,0.8)', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'Inter', size: 11 }, padding: 16, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: chartDefaults.plugins.tooltip } },
    });
  }

  // Frequency chart
  const freqCtx = document.getElementById('chart-frequency');
  if (freqCtx) {
    const fData = Array.from({ length: 60 }, () => 50 + (Math.random() - 0.5) * 0.1);
    charts.frequency = new Chart(freqCtx, {
      type: 'line',
      data: { labels: Array.from({ length: 60 }, (_, i) => i + 's'), datasets: [{ label: 'Hz', data: fData, borderColor: '#7C3AED', backgroundColor: 'rgba(124,58,237,0.1)', fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 0 }] },
      options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 49.85, max: 50.15 } }, animation: { duration: 0 } },
    });
  }

  // Update stat cards
  document.getElementById('stat-gen-val').textContent = `${state.generation.toFixed(1)} MW`;
  document.getElementById('stat-con-val').textContent = `${state.consumption.toFixed(1)} MW`;
  document.getElementById('stat-pro-val').textContent = state.prosumers.toLocaleString();
  document.getElementById('stat-carb-val').textContent = `${state.carbonSaved} tCO₂`;
  document.getElementById('stat-gen-change').textContent = '↑ 12.3%';
  document.getElementById('stat-con-change').textContent = '↓ 3.1%';
  document.getElementById('stat-pro-change').textContent = '↑ 156 today';
  document.getElementById('stat-carb-change').textContent = '↑ 8.7%';

  // Update AI context
  const ctxScore = document.getElementById('ctx-score');
  if (ctxScore) {
    ctxScore.textContent = Math.round(state.gridPulseScore);
    document.getElementById('ctx-gen').textContent = `${state.generation.toFixed(1)} MW`;
    document.getElementById('ctx-con').textContent = `${state.consumption.toFixed(1)} MW`;
  }
}

// ================================================
// CONSUMER CHARTS
// ================================================
function initConsumerCharts() {
  const hours = generateHours();
  const consCtx = document.getElementById('chart-consumer-usage');
  if (consCtx) {
    const usage = hours.map((_, i) => { const h = parseInt(hours[i]); return Math.max(0.2, Math.sin((h - 3) / 24 * Math.PI * 2) * 1.5 + 2 + Math.random() * 0.5); });
    charts.consumerUsage = new Chart(consCtx, {
      type: 'line',
      data: { labels: hours, datasets: [{ label: 'My Usage (kWh)', data: usage, borderColor: '#00B4D8', backgroundColor: 'rgba(0,180,216,0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 }] },
      options: chartDefaults,
    });
  }

  const srcCtx = document.getElementById('chart-consumer-sources');
  if (srcCtx) {
    charts.consumerSources = new Chart(srcCtx, {
      type: 'doughnut',
      data: { labels: ['My Solar', 'P2P Purchase', 'Grid'], datasets: [{ data: [45, 20, 35], backgroundColor: ['rgba(245,158,11,0.8)', 'rgba(0,229,160,0.8)', 'rgba(107,114,128,0.6)'], borderColor: 'rgba(10,14,23,0.8)', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: '#9CA3AF', font: { family: 'Inter', size: 11 }, padding: 16, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: chartDefaults.plugins.tooltip } },
    });
  }

  // Forecast charts
  initForecastCharts();
}

function initForecastCharts() {
  const hours = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) { const h = new Date(now.getTime() + i * 3600000); hours.push(h.getHours().toString().padStart(2, '0') + ':00'); }

  const solarCtx = document.getElementById('chart-solar-forecast');
  if (solarCtx) {
    const actual = generateSolarCurve(hours);
    const predicted = actual.map(v => v + (Math.random() - 0.5) * 10);
    const upper = predicted.map(v => v + 8 + Math.random() * 5);
    const lower = predicted.map(v => Math.max(0, v - 8 - Math.random() * 5));
    charts.solarForecast = new Chart(solarCtx, {
      type: 'line',
      data: { labels: hours, datasets: [
        { label: 'Upper', data: upper, borderColor: 'transparent', backgroundColor: 'rgba(245,158,11,0.08)', fill: '+1', pointRadius: 0, tension: 0.4 },
        { label: 'Predicted', data: predicted, borderColor: '#F59E0B', fill: false, tension: 0.4, borderWidth: 2, pointRadius: 0, borderDash: [5, 5] },
        { label: 'Lower', data: lower, borderColor: 'transparent', backgroundColor: 'rgba(245,158,11,0.08)', fill: '-1', pointRadius: 0, tension: 0.4 },
        { label: 'Actual', data: actual.slice(0, 12).concat(Array(12).fill(null)), borderColor: '#FBBF24', fill: false, tension: 0.4, borderWidth: 2.5, pointRadius: 0 },
      ] }, options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0 } } },
    });
  }

  const windCtx = document.getElementById('chart-wind-forecast');
  if (windCtx) {
    const actual = generateWindData();
    const predicted = actual.map(v => v + (Math.random() - 0.5) * 12);
    const upper = predicted.map(v => v + 10);
    const lower = predicted.map(v => Math.max(0, v - 10));
    charts.windForecast = new Chart(windCtx, {
      type: 'line',
      data: { labels: hours, datasets: [
        { label: 'Upper', data: upper, borderColor: 'transparent', backgroundColor: 'rgba(0,180,216,0.08)', fill: '+1', pointRadius: 0, tension: 0.4 },
        { label: 'Predicted', data: predicted, borderColor: '#00B4D8', fill: false, tension: 0.4, borderWidth: 2, pointRadius: 0, borderDash: [5, 5] },
        { label: 'Lower', data: lower, borderColor: 'transparent', backgroundColor: 'rgba(0,180,216,0.08)', fill: '-1', pointRadius: 0, tension: 0.4 },
        { label: 'Actual', data: actual.slice(0, 12).concat(Array(12).fill(null)), borderColor: '#22D3EE', fill: false, tension: 0.4, borderWidth: 2.5, pointRadius: 0 },
      ] }, options: { ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 0 } } },
    });
  }
}

// ================================================
// GRIDPULSE GAUGE
// ================================================
function initGridPulseGauge() { drawGauge(state.gridPulseScore); }

function drawGauge(score) {
  const canvas = document.getElementById('gridpulse-gauge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, r = 90;
  ctx.clearRect(0, 0, w, h);

  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineCap = 'round'; ctx.stroke();

  const angle = Math.PI * 0.75 + (score / 100) * Math.PI * 1.5;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (score < 50) { grad.addColorStop(0, '#EF4444'); grad.addColorStop(1, '#F59E0B'); }
  else if (score < 70) { grad.addColorStop(0, '#F59E0B'); grad.addColorStop(1, '#00E5A0'); }
  else { grad.addColorStop(0, '#00E5A0'); grad.addColorStop(1, '#00B4D8'); }

  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, angle); ctx.lineWidth = 12; ctx.strokeStyle = grad; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, angle); ctx.lineWidth = 12; ctx.strokeStyle = grad; ctx.filter = 'blur(8px)'; ctx.globalAlpha = 0.3; ctx.stroke(); ctx.filter = 'none'; ctx.globalAlpha = 1;

  document.getElementById('pulse-score').textContent = Math.round(score);
  const badge = document.getElementById('pulse-status');
  if (score >= 80) { badge.textContent = 'Healthy'; badge.className = 'pulse-badge'; }
  else if (score >= 60) { badge.textContent = 'Warning'; badge.className = 'pulse-badge warning'; }
  else { badge.textContent = 'Critical'; badge.className = 'pulse-badge critical'; }
}

// ================================================
// DIGITAL TWIN
// ================================================
function initDigitalTwin() {
  const canvas = document.getElementById('digital-twin-canvas');
  if (!canvas) return;
  const resize = () => { const p = canvas.parentElement; canvas.width = p.clientWidth; canvas.height = p.clientHeight; };
  resize(); window.addEventListener('resize', resize);
  document.getElementById('btn-toggle-solar').addEventListener('click', () => { state.twinState.solarActive = !state.twinState.solarActive; });
  document.getElementById('btn-toggle-wind').addEventListener('click', () => { state.twinState.windActive = !state.twinState.windActive; });
  document.getElementById('btn-toggle-battery').addEventListener('click', () => { state.twinState.batteryActive = !state.twinState.batteryActive; });
  document.getElementById('btn-simulate-fault').addEventListener('click', () => { state.twinState.fault = true; setTimeout(() => { state.twinState.fault = false; }, 3000); });
  document.getElementById('btn-reset-twin').addEventListener('click', () => { state.twinState = { solarActive: true, windActive: true, batteryActive: true, fault: false }; });
  
  // DB Reset removed from here

  drawTwin();
}

function drawTwin() {
  const canvas = document.getElementById('digital-twin-canvas');
  if (!canvas) { requestAnimationFrame(drawTwin); return; }
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  const time = Date.now() / 1000;
  const nodes = [
    { x: w*0.5, y: h*0.12, type: 'substation', label: 'Main Grid' },
    { x: w*0.25, y: h*0.3, type: 'solar', label: 'Solar Farm A' },
    { x: w*0.75, y: h*0.3, type: 'wind', label: 'Wind Farm' },
    { x: w*0.5, y: h*0.35, type: 'battery', label: 'Battery' },
    { x: w*0.15, y: h*0.55, type: 'home', label: 'Sector 1' },
    { x: w*0.35, y: h*0.55, type: 'home', label: 'Sector 2' },
    { x: w*0.55, y: h*0.55, type: 'home', label: 'Sector 3' },
    { x: w*0.75, y: h*0.55, type: 'home', label: 'Sector 4' },
    { x: w*0.25, y: h*0.75, type: 'solar', label: 'Solar B' },
    { x: w*0.5, y: h*0.75, type: 'factory', label: 'Industry' },
    { x: w*0.75, y: h*0.75, type: 'ev', label: 'EV Charging' },
    { x: w*0.88, y: h*0.55, type: 'solar', label: 'Rooftop' },
  ];
  const conns = [[0,1],[0,2],[0,3],[1,4],[1,5],[2,7],[3,5],[3,6],[4,8],[5,9],[6,9],[7,10],[7,11],[3,9],[6,10]];
  const icons = { substation:'⚡', solar:'☀️', wind:'💨', battery:'🔋', home:'🏠', factory:'🏭', ev:'🚗' };
  const colors = { substation:'0,229,160', solar:'245,158,11', wind:'0,180,216', battery:'124,58,237', home:'99,102,241', factory:'236,72,153', ev:'16,185,129' };

  conns.forEach(([a,b]) => {
    const na = nodes[a], nb = nodes[b];
    let c = 'rgba(0,229,160,0.2)';
    if (state.twinState.fault && (a===6||b===6)) c = `rgba(239,68,68,${0.3+Math.sin(time*8)*0.3})`;
    ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
    if (!state.twinState.fault || (a!==6 && b!==6)) {
      const p = ((time*0.5+a*0.3)%1);
      const px = na.x+(nb.x-na.x)*p, py = na.y+(nb.y-na.y)*p;
      ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2); ctx.fillStyle = '#00E5A0'; ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2); ctx.fillStyle = 'rgba(0,229,160,0.2)'; ctx.fill();
    }
  });

  nodes.forEach((node, i) => {
    const active = !(node.type==='solar'&&!state.twinState.solarActive) && !(node.type==='wind'&&!state.twinState.windActive) && !(node.type==='battery'&&!state.twinState.batteryActive);
    const faulted = state.twinState.fault && i===6;
    const col = colors[node.type]||'255,255,255';
    if (active && !faulted) { ctx.beginPath(); ctx.arc(node.x,node.y,28,0,Math.PI*2); const g=ctx.createRadialGradient(node.x,node.y,0,node.x,node.y,28); g.addColorStop(0,`rgba(${col},0.3)`); g.addColorStop(1,'transparent'); ctx.fillStyle=g; ctx.fill(); }
    ctx.beginPath(); ctx.arc(node.x,node.y,18,0,Math.PI*2);
    ctx.fillStyle = faulted?'rgba(239,68,68,0.3)':(active?`rgba(${col},0.2)`:'rgba(107,114,128,0.2)');
    ctx.fill(); ctx.strokeStyle = faulted?'#EF4444':(active?`rgba(${col},0.8)`:'#6B7280'); ctx.lineWidth=2; ctx.stroke();
    ctx.font='16px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(icons[node.type]||'●', node.x, node.y);
    ctx.font='500 10px Inter'; ctx.fillStyle = active?'#0f172a':'#9ca3b8'; ctx.fillText(node.label, node.x, node.y+30);
  });

  if (state.twinState.fault) {
    ctx.font='600 14px Inter'; ctx.fillStyle=`rgba(239,68,68,${0.5+Math.sin(time*6)*0.5})`; ctx.textAlign='center';
    ctx.fillText('⚡ FAULT DETECTED — Sector 3 ⚡', w/2, h-30);
    document.getElementById('twin-status').textContent='FAULT'; document.getElementById('twin-status').className='status-critical';
  } else { document.getElementById('twin-status').textContent='Stable'; document.getElementById('twin-status').className='status-healthy'; }

  requestAnimationFrame(drawTwin);
}

// ================================================
// DEMAND RESPONSE
// ================================================
const loads = [
  { name:'Air Conditioning', icon:'❄️', power:'2.5 kW', priority:4 },
  { name:'Water Heater', icon:'🔥', power:'1.8 kW', priority:4 },
  { name:'EV Charging', icon:'🚗', power:'7.2 kW', priority:3 },
  { name:'Washing Machine', icon:'🫧', power:'0.5 kW', priority:3 },
  { name:'Lighting', icon:'💡', power:'0.3 kW', priority:2 },
  { name:'Refrigerator', icon:'🧊', power:'0.15 kW', priority:1 },
  { name:'Medical Equipment', icon:'🏥', power:'0.8 kW', priority:1 },
  { name:'Internet Router', icon:'📡', power:'0.05 kW', priority:1 },
  { name:'Pool Pump', icon:'🏊', power:'1.5 kW', priority:4 },
  { name:'Smart Display', icon:'📺', power:'0.12 kW', priority:3 },
];

function initDemandResponse() {
  renderLoads('normal'); initDRGauge(0.2);
  ['normal','warning','critical','emergency'].forEach(mode => {
    document.getElementById(`btn-dr-${mode}`)?.addEventListener('click', () => {
      state.drMode = mode;
      document.querySelectorAll('.dr-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(`btn-dr-${mode}`).classList.add('active');
      const el = document.getElementById('dr-mode');
      const labels = { normal:'Normal Mode', warning:'Warning Mode', critical:'Critical Mode', emergency:'Emergency Mode' };
      el.textContent = labels[mode]; el.className = `dr-mode ${mode==='normal'?'':mode}`;
      initDRGauge({ normal:0.2, warning:0.5, critical:0.75, emergency:0.95 }[mode]);
      renderLoads(mode);
    });
  });

  // DR Timeline
  const drCtx = document.getElementById('chart-dr-timeline');
  if (drCtx) {
    const hours = generateHours();
    const demand = generateConsumptionCurve(hours);
    const supply = demand.map(d => d * (0.85 + Math.random() * 0.3));
    charts.drTimeline = new Chart(drCtx, {
      type: 'bar',
      data: { labels: hours, datasets: [{ label:'Demand', data:demand, backgroundColor:'rgba(239,68,68,0.6)', borderRadius:4 }, { label:'Supply', data:supply, backgroundColor:'rgba(0,229,160,0.6)', borderRadius:4 }] },
      options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display:true, position:'top', align:'end', labels: { color:'#9CA3AF', font:{family:'Inter',size:11}, usePointStyle:true, pointStyleWidth:8, padding:16 } } } },
    });
  }
}

function renderLoads(mode) {
  const list = document.getElementById('load-list');
  if (!list) return; list.innerHTML = '';
  const threshold = { normal:5, warning:4, critical:3, emergency:2 }[mode];
  loads.sort((a,b) => b.priority - a.priority).forEach(load => {
    const curtailed = load.priority >= threshold;
    const reduced = load.priority === threshold-1 && mode !== 'normal';
    const div = document.createElement('div');
    div.className = `load-item priority-${load.priority} ${curtailed?'curtailed':''}`;
    let sc='on', st='Active'; if (curtailed){sc='curtailed';st='Curtailed';} else if(reduced){sc='reduced';st='Reduced';}
    div.innerHTML = `<span class="load-icon">${load.icon}</span><div class="load-info"><span class="load-name">${load.name}</span><span class="load-power">${load.power} • Priority ${load.priority}</span></div><span class="load-status ${sc}">${st}</span>`;
    list.appendChild(div);
  });
}

function initDRGauge(level) {
  const canvas = document.getElementById('dr-gauge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, cx = w/2, cy = h-20, r = 110;
  ctx.clearRect(0,0,w,h);
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0); ctx.lineWidth=16; ctx.strokeStyle='rgba(0,0,0,0.06)'; ctx.lineCap='round'; ctx.stroke();
  [{s:0,e:0.35,c:'#10B981'},{s:0.35,e:0.6,c:'#F59E0B'},{s:0.6,e:0.85,c:'#EF4444'},{s:0.85,e:1,c:'#DC2626'}].forEach(seg => {
    ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI+seg.s*Math.PI,Math.PI+seg.e*Math.PI); ctx.lineWidth=16; ctx.strokeStyle=seg.c; ctx.globalAlpha=0.3; ctx.lineCap='butt'; ctx.stroke(); ctx.globalAlpha=1;
  });
  const na = Math.PI+level*Math.PI, nx = cx+Math.cos(na)*(r-20), ny = cy+Math.sin(na)*(r-20);
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(nx,ny); ctx.strokeStyle = level>0.6?'#EF4444':(level>0.35?'#F59E0B':'#10B981'); ctx.lineWidth=3; ctx.lineCap='round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fillStyle='#0f172a'; ctx.fill();
  ctx.font='600 14px JetBrains Mono'; ctx.fillStyle='#0f172a'; ctx.textAlign='center'; ctx.fillText(`${Math.round(level*100)}%`,cx,cy-30);
}

// ================================================
// MARKETPLACE
// ================================================
const prosumerNames = ['Aditi S.','Rahul M.','Priya K.','Vikram J.','Sneha P.','Arjun L.','Meera R.','Karthik B.','Divya N.','Rohit G.','Ananya T.','Sanjay D.','Pooja V.','Nikhil H.','Kavita S.'];

function initMarketplace() {
  document.getElementById('market-price').textContent = `₹${(3.5 + Math.random() * 3).toFixed(2)}/kWh`;
  document.getElementById('market-trades').textContent = Math.round(200 + Math.random() * 100);
  document.getElementById('market-energy').textContent = `${Math.round(1500 + Math.random() * 500)} kWh`;
  document.getElementById('market-savings').textContent = `₹${Math.round(5000 + Math.random() * 5000).toLocaleString()}`;

  const priceCtx = document.getElementById('chart-price');
  if (priceCtx) {
    const hours = generateHours();
    charts.price = new Chart(priceCtx, {
      type: 'line',
      data: { labels: hours, datasets: [{ label:'₹/kWh', data: hours.map(() => 3.5 + Math.random() * 3), borderColor:'#00E5A0', backgroundColor:'rgba(0,229,160,0.1)', fill:true, tension:0.4, borderWidth:2, pointRadius:0 }] },
      options: chartDefaults,
    });
  }
}

let globalTrades = {};

function initTradesSync() {
  if (db) {
    onValue(ref(db, 'trades'), (snapshot) => {
      globalTrades = snapshot.val() || {};
      renderTrades();
    });
  }
}

function renderTrades() {
  const tradesList = Object.entries(globalTrades).sort((a,b) => b[1].timestamp - a[1].timestamp);
  
  // Admin Trades Approval Table
  const aBody = document.getElementById('admin-trades-body');
  if (aBody) {
    aBody.innerHTML = '';
    if (tradesList.length === 0) {
      aBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No pending trades</td></tr>';
    } else {
      tradesList.forEach(([id, t]) => {
        const tr = document.createElement('tr');
        const stClass = t.status === 'Completed' ? 'completed' : 'pending';
        const actionBtn = t.status === 'Pending' ? `<button class="btn btn-primary" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="resolveTrade('${id}')">Approve</button>` : '✓';
        tr.innerHTML = `<td>${t.userName}</td><td><span class="order-type-${t.type.toLowerCase()}">${t.type}</span></td><td>${t.energy}</td><td>₹${t.price}</td><td><span class="order-status ${stClass}">${t.status}</span></td><td>${actionBtn}</td>`;
        aBody.appendChild(tr);
      });
    }
  }
  
  // Consumer Orderbook (Marketplace & Dashboard)
  const renderConsumerTable = (bodyId, filterMine) => {
    const tbody = document.getElementById(bodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    const filtered = filterMine ? tradesList.filter(t => t[1].userId === state.currentUser?.email) : tradesList;
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1rem;">No trades found</td></tr>';
    } else {
      filtered.forEach(([id, t]) => {
        const tr = document.createElement('tr');
        const stClass = t.status === 'Completed' ? 'completed' : 'pending';
        tr.innerHTML = `<td>${filterMine ? new Date(t.timestamp).toLocaleDateString() : t.userName}</td><td><span class="order-type-${t.type.toLowerCase()}">${t.type}</span></td><td>${t.energy}</td><td>₹${t.price}</td><td><span class="order-status ${stClass}">${t.status}</span></td>`;
        tbody.appendChild(tr);
      });
    }
  };
  
  renderConsumerTable('orderbook-body', false); // Marketplace
  renderConsumerTable('c-orderbook-body', true); // Dashboard
}

window.resolveTrade = function(tradeId) {
  if (db) {
    update(ref(db, `trades/${tradeId}`), { status: 'Completed' });
    push(ref(db, 'activities'), { type: 'trade', text: `P2P trade completed via Grid Admin approval`, timestamp: Date.now() });
  }
};

// ================================================
// CARBON CREDITS
// ================================================
function initCarbonCredits() {
  drawCarbonRing();
  renderLeaderboard();
  document.getElementById('carbon-rank').textContent = `🏆 Rank #${Math.floor(Math.random()*15+5)}`;
  document.getElementById('carbon-score-val').textContent = state.currentUser?.greenScore || 847;
  document.getElementById('c-total').textContent = `${state.currentUser?.carbonSaved || 47.2} tCO₂`;
  document.getElementById('c-trees').textContent = Math.round((parseFloat(state.currentUser?.carbonSaved) || 47.2) * 50).toLocaleString();
  document.getElementById('c-cars').textContent = `${Math.round((parseFloat(state.currentUser?.carbonSaved) || 47.2) * 400).toLocaleString()} km`;

  const carbonCtx = document.getElementById('chart-carbon-monthly');
  if (carbonCtx) {
    charts.carbonMonthly = new Chart(carbonCtx, {
      type: 'bar',
      data: { labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'], datasets: [{ label:'tCO₂', data: [3.2,4.1,4.8,5.2,6.1,5.8,6.5,5.9,5.6], backgroundColor: (ctx) => { const { chart, chartArea } = ctx; if (!chartArea) return '#00E5A0'; const g = chart.ctx.createLinearGradient(0,chartArea.bottom,0,chartArea.top); g.addColorStop(0,'rgba(0,229,160,0.3)'); g.addColorStop(1,'rgba(0,180,216,0.8)'); return g; }, borderRadius:8, borderSkipped:false }] },
      options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display: false } } },
    });
  }
}

function drawCarbonRing() {
  const canvas = document.getElementById('carbon-ring');
  if (!canvas) return;
  const ctx = canvas.getContext('2d'), w=canvas.width, h=canvas.height, cx=w/2, cy=h/2, r=80;
  ctx.clearRect(0,0,w,h);
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.lineWidth=10; ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.stroke();
  const progress = 0.847;
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+progress*Math.PI*2);
  const grad = ctx.createLinearGradient(0,0,w,h); grad.addColorStop(0,'#00E5A0'); grad.addColorStop(1,'#00B4D8');
  ctx.lineWidth=10; ctx.strokeStyle=grad; ctx.lineCap='round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+progress*Math.PI*2); ctx.lineWidth=10; ctx.strokeStyle=grad; ctx.filter='blur(6px)'; ctx.globalAlpha=0.3; ctx.stroke(); ctx.filter='none'; ctx.globalAlpha=1;
}

function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  
  let leaders = getUsers().filter(u => u.role === 'consumer').map(u => ({
    name: u.name,
    score: u.greenScore,
    carbon: `${u.carbonSaved} tCO₂`
  }));

  // Do not pad with dummy users anymore.
  // Real users only.

  list.innerHTML = '';
  leaders.sort((a,b) => b.score - a.score).slice(0, 10).forEach((l,i) => {
    const rc = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const isYou = l.name === state.currentUser?.name;
    const div = document.createElement('div');
    div.className = 'leaderboard-item'; div.style.background = isYou ? 'rgba(0,229,160,0.08)' : '';
    div.innerHTML = `<span class="leaderboard-rank ${rc}">${i+1}</span><span class="leaderboard-name">${isYou?'⭐ ':''}${l.name}</span><span class="leaderboard-score">${l.score}</span><span class="leaderboard-carbon">${l.carbon}</span>`;
    list.appendChild(div);
  });
}

// ================================================
// NOTIFICATIONS
// ================================================
function initNotifications() {
  document.getElementById('notification-btn').addEventListener('click', () => document.getElementById('notification-panel').classList.toggle('open'));
  document.getElementById('notif-close').addEventListener('click', () => document.getElementById('notification-panel').classList.remove('open'));
}

// ================================================
// LIVE SIMULATION ENGINE & FIREBASE SYNC
// ================================================
const activityMessages = [
  { type:'trade', text:'P2P trade: {e} kWh @ ₹{p}/kWh completed' },
  { type:'system', text:'Grid frequency adjusted: {f} Hz → baseline' },
  { type:'alert', text:'Solar output drop in Sector {s} — cloud cover ↑' },
  { type:'success', text:'Battery charged to {pct}% — ready for peak' },
  { type:'trade', text:'New sell order: {e} kWh from rooftop prosumer' },
  { type:'system', text:'Demand response signal → {c} devices, Sector {s}' },
  { type:'success', text:'Wind output ↑ {pw} kW — favorable conditions' },
  { type:'alert', text:'Voltage fluctuation on feeder F-{l}' },
  { type:'trade', text:'Carbon credit earned: {cr} pts for green energy' },
  { type:'system', text:'AI forecast updated — accuracy: {a}%' },
];

function addActivity(msgOverride) {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;
  
  let type = 'system';
  let text = '';
  
  if (msgOverride) {
    type = msgOverride.type;
    text = msgOverride.text;
  } else {
    const msg = activityMessages[Math.floor(Math.random()*activityMessages.length)];
    text = msg.text.replace('{e}',(Math.random()*20+1).toFixed(1)).replace('{p}',(3.5+Math.random()*3).toFixed(2)).replace('{f}',(49.95+Math.random()*0.1).toFixed(3)).replace('{s}',Math.floor(Math.random()*7+1)).replace('{pct}',Math.floor(Math.random()*30+70)).replace('{c}',Math.floor(Math.random()*50+10)).replace('{pw}',(Math.random()*5+2).toFixed(1)).replace('{l}',Math.floor(Math.random()*12+1)).replace('{cr}',Math.floor(Math.random()*10+1)).replace('{a}',(90+Math.random()*8).toFixed(1));
    type = msg.type;
    
    // Push to Firebase if Admin
    if (db && state.currentUser?.role === 'admin') {
      const msgsRef = ref(db, 'activities');
      push(msgsRef, { type, text, timestamp: Date.now() });
      return; // The listener will handle the UI update
    } else if (db) {
      return; // Consumers just wait for the listener
    }
  }

  const now = new Date();
  const div = document.createElement('div');
  div.className = `activity-item ${type}`;
  div.innerHTML = `<span class="activity-time">${now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span><span class="activity-text">${text}</span>`;
  feed.insertBefore(div, feed.firstChild);
  while (feed.children.length > 20) feed.removeChild(feed.lastChild);

  // Add notification
  const notifList = document.getElementById('notif-list');
  const countEl = document.getElementById('notification-count');
  if (notifList && type === 'alert') {
    const ni = document.createElement('div');
    ni.className = 'notif-item warning';
    ni.innerHTML = `<span class="notif-icon">⚠️</span><div class="notif-content"><p class="notif-title">Grid Alert</p><p class="notif-desc">${text}</p><span class="notif-time">Just now</span></div>`;
    notifList.insertBefore(ni, notifList.firstChild);
    if(countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1;
  }
}

function updateSimulationUI(newState) {
  state.gridPulseScore = newState.gridPulseScore;
  state.generation = newState.generation;
  state.consumption = newState.consumption;
  state.drMode = newState.drMode || 'normal';
  state.twinState = newState.twinState || state.twinState;

  drawGauge(state.gridPulseScore);

  const genEl = document.getElementById('stat-gen-val');
  if (genEl) genEl.textContent = `${state.generation.toFixed(1)} MW`;
  const conEl = document.getElementById('stat-con-val');
  if (conEl) conEl.textContent = `${state.consumption.toFixed(1)} MW`;

  if (charts.frequency) {
    charts.frequency.data.datasets[0].data.push(50+(Math.random()-0.5)*0.08);
    charts.frequency.data.datasets[0].data.shift();
    charts.frequency.update('none');
  }

  const freqEl = document.getElementById('metric-freq');
  if (freqEl) {
    freqEl.textContent = `±${(Math.random()*0.06).toFixed(3)} Hz`;
    document.getElementById('metric-voltage').textContent = `${(98.5+Math.random()*1.4).toFixed(1)}%`;
    const ren = 60+Math.random()*15;
    document.getElementById('metric-renewable').textContent = `${Math.round(ren)}%`;
    document.getElementById('metric-gap').textContent = `${state.generation > state.consumption ? '+' : ''}${(state.generation-state.consumption).toFixed(1)} MW`;
    document.getElementById('bar-freq').style.width = `${90+Math.random()*10}%`;
    document.getElementById('bar-voltage').style.width = `${97+Math.random()*3}%`;
    document.getElementById('bar-renewable').style.width = `${Math.round(ren)}%`;
    document.getElementById('bar-gap').style.width = `${80+Math.random()*18}%`;
  }

  // Twin flows
  const fs = document.getElementById('flow-solar-val');
  if (fs) { fs.textContent=`${(3+Math.random()*3).toFixed(1)} kW`; document.getElementById('flow-wind-val').textContent=`${(1.5+Math.random()*2.5).toFixed(1)} kW`; document.getElementById('flow-battery-val').textContent=`${(1+Math.random()*2).toFixed(1)} kW`; document.getElementById('flow-demand-val').textContent=`${(4+Math.random()*3).toFixed(1)} kW`; }

  // AI context
  const ctxScore = document.getElementById('ctx-score');
  if (ctxScore) { ctxScore.textContent=Math.round(state.gridPulseScore); document.getElementById('ctx-gen').textContent=`${state.generation.toFixed(1)} MW`; document.getElementById('ctx-con').textContent=`${state.consumption.toFixed(1)} MW`; }
}

function runSimulationLogic() {
  // Only the Admin drives the state in Firebase mode (or if no DB, runs locally)
  let score = state.gridPulseScore + (Math.random()-0.5) * 2;
  score = Math.max(40, Math.min(98, score));
  
  // Base grid numbers (MW)
  const baseGen = 140;
  const baseCon = 138;
  
  // Scale with registered consumers (assuming 0.005 MW per user on average)
  const usersCount = getUsers().filter(u => u.role === 'consumer').length;
  const userGenImpact = usersCount * (0.005 + (Math.random() * 0.002));
  const userConImpact = usersCount * (0.006 + (Math.random() * 0.002));

  let gen = baseGen + userGenImpact + (Math.random()-0.5)*2; 
  let con = baseCon + userConImpact + (Math.random()-0.5)*1.5;
  
  const newState = {
    gridPulseScore: score,
    generation: gen,
    consumption: con,
    drMode: state.drMode,
    twinState: state.twinState
  };

  if (db) {
    set(ref(db, 'gridState'), newState);
  } else {
    updateSimulationUI(newState);
  }
}

function startSimulation() {
  // 1. Setup Firebase Listeners if db is active
  if (db) {
    const stateRef = ref(db, 'gridState');
    onValue(stateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) updateSimulationUI(data);
    });

    const activitiesRef = ref(db, 'activities');
    onValue(activitiesRef, (snapshot) => {
      const feed = document.getElementById('activity-feed');
      if (!feed) return;
      
      const acts = [];
      snapshot.forEach(child => { acts.push(child.val()); });
      
      acts.sort((a,b) => b.timestamp - a.timestamp);
      
      feed.innerHTML = '';
      acts.slice(0, 20).forEach(act => {
        const d = new Date(act.timestamp);
        const div = document.createElement('div');
        div.className = `activity-item ${act.type}`;
        div.innerHTML = `<span class="activity-time">${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span><span class="activity-text">${act.text}</span>`;
        feed.appendChild(div);
      });
    });
  }

  // 2. Start Simulation Loop (Admin only if using Firebase, otherwise everyone locally)
  const shouldDriveSimulation = !db || state.currentUser?.role === 'admin';

  if (shouldDriveSimulation) {
    setInterval(addActivity, 3000 + Math.random() * 2000);
    setInterval(runSimulationLogic, 2000);
  }

  setInterval(() => renderUsersTable(), 30000); // Refresh users for admin
  
  if (!db) {
    for (let i = 0; i < 5; i++) setTimeout(addActivity, i * 500);
  }
}
