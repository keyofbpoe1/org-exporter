# 🚀 Org Exporter (Full-Stack Streaming App)

A high-performance web application that extracts full organizational hierarchy data from ACS Nucleus and streams it in real time.

---

## ✨ Features

- ⚡ Blazing fast traversal (batched + parallel BFS)
- 📡 Real-time streaming UI
- 🧠 Scalable to large org structures
- 📊 CSV export with email extraction
- 🔄 Non-blocking architecture
- ✅ Production-ready deployment (Render compatible)

---

## 🏗️ Tech Stack

**Frontend**
- React
- Streaming fetch API

**Backend**
- Node.js (Express)
- Child process execution

**Worker**
- Python (requests, concurrency)

---

## 📁 Project Structure

```
org-exporter/
│
├── OrgExporter.py
├── server/
│   ├── server.js
│   └── package.json
│
├── client/
│   ├── src/
│   └── package.json
│
└── README.md
```

---

## ⚡ How It Works

1. User enters Org ID + cookie
2. React sends request → Node API
3. Node spawns Python process
4. Python streams results (node-by-node)
5. React renders data in real-time

---

## 🚀 Getting Started

### 1. Clone Repo

```
git clone https://github.com/YOUR_USERNAME/org-exporter.git
cd org-exporter
```

### 2. Install Dependencies

```
cd server
npm install

cd ../client
npm install
```

### 3. Build Frontend

```
npm run build
```

### 4. Run Server

```
node server/server.js
```

### 5. Open App

http://localhost:3000

---

## 🔐 Authentication (Important)

Requires ACS session cookie:
1. Log into nucleus.acs.org
2. Copy cookie from browser DevTools
3. Paste into the app (saved after first use)

---

## 📊 CSV Export

Includes:
- Name
- Job Title
- Email

---

## 🌐 Deployment (Render)

Build command:
```
npm run build
```

Start command:
```
npm start
```

---

## 💥 Summary

✅ Fast
✅ Real-time
✅ Scalable

