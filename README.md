# GridSynth ⚡ (Schneider Electric Theme)

> **Empowering Prosumers. Orchestrating Microgrids. Powered by AI.**

Welcome to **GridSynth**, an AI-powered renewable energy orchestration platform designed to transform traditional energy consumers into active, intelligent **Prosumers**. 

Built with a stunning, modern **Schneider Electric Light Theme**, GridSynth provides real-time digital twin monitoring, peer-to-peer (P2P) energy trading, and predictive AI load-balancing to ensure zero energy waste.

---

## 🌟 Key Features for Judges

### 1. Dual-Role Dashboard
- **Consumer View:** Allows individual homeowners to track their rooftop solar generation, battery storage, and live carbon footprint.
- **Grid Admin View:** Provides network operators with a bird's-eye view of the microgrid, including real-time frequency stability and aggregate demand-response metrics.

### 2. Interactive Digital Twin
- A live, animated canvas rendering the entire microgrid topology (Solar Farms, Wind Farms, EV Charging Stations, and Residential Sectors).
- Simulates power flows and instantly highlights fault detections in real-time, allowing admins to isolate grid failures before they cascade.

### 3. Peer-to-Peer (P2P) Energy Marketplace
- Live simulated orderbook where prosumers can buy and sell excess battery storage.
- Real-time trading sync powered by **Firebase Realtime Database**.
- Automatic tracking of energy savings and revenue generation.

### 4. Demand Response & Smart Curtailment
- Dynamic load priority matrix (Priority 1-4).
- When grid stress reaches "Warning" or "Critical" levels, non-essential loads (like Pool Pumps and Water Heaters) are visually curtailed to stabilize the grid frequency.

### 5. Gemini AI Energy Advisor
- Integrated with Google's **Gemini AI API** to provide localized, real-time energy insights.
- Evaluates live grid conditions, battery levels, and weather data to advise users on the most profitable times to sell energy or shift major appliance loads.

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Setup Steps
1. **Clone the repository**
   \`\`\`bash
   git clone https://github.com/shriya-0802/Schneider.git
   cd Schneider
   \`\`\`

2. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configure Environment Variables**
   Create a \`.env\` file in the root directory and add your keys (never commit this file!):
   \`\`\`env
   VITE_FIREBASE_API_KEY="your-firebase-api-key"
   VITE_FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
   VITE_FIREBASE_DATABASE_URL="https://your-app.firebaseio.com"
   VITE_FIREBASE_PROJECT_ID="your-project-id"
   VITE_GEMINI_API_KEY="your-gemini-api-key"
   \`\`\`

4. **Start the Development Server**
   \`\`\`bash
   npm run dev
   \`\`\`
   The application will be available at \`http://localhost:5173\`.

