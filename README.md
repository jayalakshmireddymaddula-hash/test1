# 🌟 Gemini AI Nexus - Full-Stack LLM Chatbot with Supabase

An intelligent, full-stack conversational AI chatbot powered by Google's **Gemini LLM** with real-time streaming, rich markdown parsing, syntax-highlighted code blocks, **Supabase** PostgreSQL cloud database persistence, and a clear architectural separation between **Frontend** and **Backend**.

---

## 📁 Project Architecture & Folder Differentiation

```text
test/
├── backend/                       # 🖥️ Node.js & Express API Server
│   ├── .env.example               # Environment variables template
│   ├── .env                       # Backend environment file (Gemini & Supabase keys)
│   ├── package.json               # Backend dependencies (@google/generative-ai, @supabase/supabase-js)
│   └── server.js                  # Express API server (Gemini SDK & Supabase Client)
│
├── frontend/                      # 🎨 Client Web Application (HTML / CSS / JS)
│   ├── .env.example               # Frontend environment template
│   ├── .env                       # Frontend environment file (Supabase public credentials)
│   ├── index.html                 # Semantic HTML5 chat interface & settings modal
│   ├── styles.css                 # Vanilla CSS design system (Glassmorphism & animations)
│   └── app.js                     # Frontend controller (SSE streaming, Supabase client, Markdown)
│
├── supabase_schema.sql            # 🗄️ SQL schema to create the 'messages' table in Supabase
├── package.json                   # Root package.json with quick start commands
└── README.md                      # Project documentation & setup guide
```

---

## 🔑 Environment Variables Configuration

Both the **Frontend** and **Backend** have dedicated `.env` and `.env.example` files:

### 1. Frontend Environment File: [`frontend/.env`](file:///c:/Users/Jayalakshmi%20M/Desktop/test/frontend/.env)
Contains client-facing environment variables safe for browser use:

```env
# Supabase Project URL (e.g., https://yourproject.supabase.co)
SUPABASE_URL=

# Supabase Anonymous Public Key (safe for client-side use)
SUPABASE_ANON_KEY=

# Backend API Endpoint URL
API_BASE_URL=http://localhost:5000/api
```

---

### 2. Backend Environment File: [`backend/.env`](file:///c:/Users/Jayalakshmi%20M/Desktop/test/backend/.env)
Contains server configuration, private API keys, and admin credentials:

```env
# Server Port
PORT=5000

# Google Gemini API Key (get from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=

# Default Model (gemini-1.5-flash, gemini-2.0-flash, or gemini-1.5-pro)
DEFAULT_MODEL=gemini-1.5-flash

# Supabase Configuration
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Supabase Service Role Key (Admin secret key for database operations - Keep secret!)
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 🗄️ Supabase Migration (Execute with a Single Command)

To create all the required tables and policies in your Supabase database automatically:

```bash
npm run db:migrate
```

The script will connect to your Supabase project (`dxbdduyfjyrpsvunrzst.supabase.co`), read [`supabase/migrations/20261014000000_create_chatbot_tables.sql`](file:///c:/Users/Jayalakshmi%20M/Desktop/test/supabase/migrations/20261014000000_create_chatbot_tables.sql), and create:
- `public.chat_sessions`
- `public.messages`
- Indexes for low-latency message history queries
- Row Level Security (RLS) policies

*(If you haven't set `DATABASE_PASSWORD` in `backend/.env` yet, the terminal will securely prompt you to enter it once and save it automatically).*

---

## 🚀 Quick Start Guide

### 1. Start the Server
```bash
npm start
```
*(or `node backend/server.js`)*

### 2. Open the Application
Navigate to **[http://localhost:5000](http://localhost:5000)** in your browser.

### 3. Configure API Keys in the UI
Click **"API & Supabase"** in the top right navbar to:
- Test and save your **Google Gemini API Key**.
- Test your **Supabase Connection** with live feedback.
- Click **"Sync Messages"** to pull cloud history into your chat window!

---

## ⚙️ API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/config` | Exposes public Supabase & model configuration |
| `GET` | `/api/health` | Health check for backend, Gemini key, and Supabase status |
| `GET` | `/api/models` | List of supported Gemini models |
| `POST` | `/api/chat` | Standard REST chat completion (auto-logged to Supabase) |
| `POST` | `/api/chat/stream` | Real-time Server-Sent Events (SSE) streaming chat |
| `POST` | `/api/validate-key`| Test Gemini API key validity |
| `POST` | `/api/supabase/test`| Test Supabase database connection |
| `GET` | `/api/chats` | Retrieve saved messages from Supabase by session ID |
| `POST` | `/api/chats/save` | Explicitly save chat messages to Supabase |
| `DELETE` | `/api/chats` | Clear chat messages from Supabase for a session |
