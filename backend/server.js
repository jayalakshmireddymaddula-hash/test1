import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// Initialize directory paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env (and frontend/.env as fallback)
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../frontend/.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Supported models catalog
const SUPPORTED_MODELS = [
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    badge: 'Fast & Versatile',
    description: 'Optimized for speed, high rate limits, and everyday reasoning tasks.'
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    badge: 'Next-Gen Speed',
    description: 'Next-generation multimodal model with ultra-fast latency and enhanced capability.'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    badge: 'Complex Reasoning',
    description: 'Best for deep analytical thinking, multi-step code generation, and complex math.'
  }
];

// ==========================================
// SUPABASE CLIENT HELPER
// ==========================================
/**
 * Factory for creating or retrieving a Supabase client.
 * Prioritizes service role key for backend tasks if present, otherwise uses anon key.
 */
function getSupabaseClient(customUrl, customKey) {
  const url = customUrl || process.env.SUPABASE_URL;
  const key = customKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key || !url.startsWith('http')) {
    return null;
  }

  try {
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch (err) {
    console.error('Supabase initialization error:', err.message);
    return null;
  }
}

/**
 * Fire-and-forget helper to save a chat message into the Supabase 'messages' table
 */
async function logMessageToSupabase({ sessionId = 'default-session', role, content, model }) {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client.from('messages').insert([
      {
        session_id: sessionId,
        role,
        content,
        model: model || 'gemini-1.5-flash',
        created_at: new Date().toISOString()
      }
    ]);

    if (error) {
      // Table might not exist yet if user hasn't run the schema
      if (error.code === '42P01') {
        console.warn('Supabase Note: "messages" table not found. Please run supabase_schema.sql in your Supabase SQL Editor.');
      } else {
        console.warn('Supabase insert warning:', error.message);
      }
    }
  } catch (e) {
    console.warn('Supabase logging failed silently:', e.message);
  }
}

// ==========================================
// GEMINI KEY RESOLUTION & HELPERS
// ==========================================
function resolveApiKey(req) {
  const headerKey = req.headers['x-gemini-key'];
  if (typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  if (req.body && typeof req.body.apiKey === 'string' && req.body.apiKey.trim().length > 0) {
    return req.body.apiKey.trim();
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return process.env.GEMINI_API_KEY.trim();
  }
  return null;
}

function formatHistory(rawHistory = []) {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) {
    return [];
  }

  const formatted = [];

  for (const item of rawHistory) {
    if (!item) continue;
    const rawRole = (item.role || '').toLowerCase();
    const role = rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'model' ? 'model' : 'user';
    const text = typeof item.content === 'string' ? item.content.trim() : (typeof item.text === 'string' ? item.text.trim() : '');

    if (!text) continue;

    if (formatted.length > 0 && formatted[formatted.length - 1].role === role) {
      formatted[formatted.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      formatted.push({
        role,
        parts: [{ text }]
      });
    }
  }

  while (formatted.length > 0 && formatted[0].role !== 'user') {
    formatted.shift();
  }

  return formatted;
}

function formatGeminiError(error) {
  const message = error?.message || 'Unknown error occurred';

  if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
    return {
      status: 401,
      error: 'Invalid Gemini API Key. Please verify your API key in settings or backend/.env.'
    };
  }
  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('quota')) {
    return {
      status: 429,
      error: 'Gemini API quota exceeded or rate limit reached. Please wait a moment or try another model.'
    };
  }
  if (message.includes('SAFETY') || message.includes('blocked')) {
    return {
      status: 400,
      error: 'The response was blocked by Gemini safety filters.'
    };
  }
  if (message.includes('models/') && message.includes('is not found')) {
    return {
      status: 404,
      error: `The requested model is not available for your API key. Try switching to 'gemini-1.5-flash'.`
    };
  }

  return {
    status: 500,
    error: message
  };
}

// ==========================================
// CONFIG & HEALTH ROUTES
// ==========================================

/**
 * GET /api/config
 * Provides public client configuration safely (Supabase URL & Anon Key)
 */
app.get('/api/config', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  const hasSupabase = Boolean(supabaseUrl && (supabaseAnonKey || process.env.SUPABASE_SERVICE_ROLE_KEY));

  res.json({
    supabaseUrl,
    supabaseAnonKey,
    hasGeminiKey,
    hasSupabase,
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-1.5-flash'
  });
});

/**
 * GET /api/health
 * Returns service status, Gemini key status, and Supabase status
 */
app.get('/api/health', (req, res) => {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  const hasSupabase = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

  res.json({
    status: 'ok',
    message: 'Gemini Chatbot Backend is running smoothly',
    hasServerKey,
    hasSupabase,
    supabaseConfigured: hasSupabase,
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-1.5-flash',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/models
 */
app.get('/api/models', (req, res) => {
  res.json({
    models: SUPPORTED_MODELS,
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-1.5-flash'
  });
});

/**
 * POST /api/validate-key
 */
app.post('/api/validate-key', async (req, res) => {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(400).json({ valid: false, error: 'No API key provided' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('ping');
    const response = await result.response;
    const text = response.text();
    return res.json({ valid: true, message: 'API Key is valid and active!', sample: text.substring(0, 30) });
  } catch (error) {
    const formatted = formatGeminiError(error);
    return res.status(formatted.status).json({ valid: false, error: formatted.error });
  }
});

// ==========================================
// SUPABASE API ROUTES
// ==========================================

/**
 * POST /api/supabase/test
 * Test Supabase connectivity with provided or server credentials
 */
app.post('/api/supabase/test', async (req, res) => {
  const { url, key } = req.body || {};
  const client = getSupabaseClient(url, key);

  if (!client) {
    return res.status(400).json({
      connected: false,
      error: 'Please provide both SUPABASE_URL and SUPABASE_ANON_KEY or configure them in .env.'
    });
  }

  try {
    // Attempt a lightweight test query
    const { data, error } = await client.from('messages').select('id').limit(1);

    if (error) {
      if (error.code === '42P01') {
        return res.json({
          connected: true,
          tableExists: false,
          message: 'Connected to Supabase! (Note: "messages" table does not exist yet. Please run supabase_schema.sql in Supabase SQL editor).'
        });
      }
      return res.status(400).json({ connected: false, error: error.message });
    }

    return res.json({
      connected: true,
      tableExists: true,
      message: 'Successfully connected to Supabase and verified "messages" table!'
    });
  } catch (err) {
    return res.status(500).json({ connected: false, error: err.message });
  }
});

/**
 * GET /api/chats
 * Retrieve saved messages for a session from Supabase
 */
app.get('/api/chats', async (req, res) => {
  const sessionId = req.query.sessionId || 'default-session';
  const client = getSupabaseClient();

  if (!client) {
    return res.status(503).json({
      error: 'Supabase is not configured on the backend. Please add SUPABASE_URL and keys to backend/.env.'
    });
  }

  try {
    const { data, error } = await client
      .from('messages')
      .select('id, session_id, role, content, model, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ messages: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chats/save
 * Explicitly save messages to Supabase
 */
app.post('/api/chats/save', async (req, res) => {
  const { sessionId = 'default-session', messages } = req.body;
  const client = getSupabaseClient();

  if (!client) {
    return res.status(503).json({ error: 'Supabase is not configured.' });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Payload must include a non-empty "messages" array.' });
  }

  const records = messages.map(m => ({
    session_id: sessionId,
    role: m.role || 'user',
    content: m.content || m.text || '',
    model: m.model || 'gemini-1.5-flash',
    created_at: m.created_at || new Date().toISOString()
  }));

  try {
    const { data, error } = await client.from('messages').insert(records);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, count: records.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/chats
 * Clear chat history for a session from Supabase
 */
app.delete('/api/chats', async (req, res) => {
  const sessionId = req.query.sessionId || 'default-session';
  const client = getSupabaseClient();

  if (!client) {
    return res.status(503).json({ error: 'Supabase is not configured.' });
  }

  try {
    const { error } = await client.from('messages').delete().eq('session_id', sessionId);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, message: `Cleared messages for session: ${sessionId}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// GEMINI CHAT ROUTES
// ==========================================

/**
 * POST /api/chat
 */
app.post('/api/chat', async (req, res) => {
  const { message, history = [], model: requestedModel, systemInstruction, temperature, sessionId = 'default-session' } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Please provide a non-empty message prompt.' });
  }

  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(400).json({
      error: 'Gemini API Key is missing. Add it to backend/.env or enter it in the frontend Settings dialog.',
      missingKey: true
    });
  }

  const modelName = requestedModel || process.env.DEFAULT_MODEL || 'gemini-1.5-flash';

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelConfig = {
      model: modelName,
      generationConfig: {
        temperature: typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.7
      }
    };

    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim().length > 0) {
      modelConfig.systemInstruction = systemInstruction.trim();
    }

    const model = genAI.getGenerativeModel(modelConfig);
    const formattedHistory = formatHistory(history);

    const chat = model.startChat({
      history: formattedHistory
    });

    const result = await chat.sendMessage(message.trim());
    const response = await result.response;
    const replyText = response.text();

    // Persist to Supabase in background (if configured)
    logMessageToSupabase({ sessionId, role: 'user', content: message.trim(), model: modelName });
    logMessageToSupabase({ sessionId, role: 'model', content: replyText, model: modelName });

    res.json({
      reply: replyText,
      role: 'model',
      model: modelName,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Gemini Chat API Error:', error);
    const formatted = formatGeminiError(error);
    res.status(formatted.status).json({ error: formatted.error });
  }
});

/**
 * POST /api/chat/stream
 */
app.post('/api/chat/stream', async (req, res) => {
  const { message, history = [], model: requestedModel, systemInstruction, temperature, sessionId = 'default-session' } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Please provide a non-empty message prompt.' });
  }

  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(400).json({
      error: 'Gemini API Key is missing. Add it to backend/.env or enter it in the frontend Settings dialog.',
      missingKey: true
    });
  }

  const modelName = requestedModel || process.env.DEFAULT_MODEL || 'gemini-1.5-flash';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  let clientAborted = false;
  req.on('close', () => {
    clientAborted = true;
  });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelConfig = {
      model: modelName,
      generationConfig: {
        temperature: typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.7
      }
    };

    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim().length > 0) {
      modelConfig.systemInstruction = systemInstruction.trim();
    }

    const model = genAI.getGenerativeModel(modelConfig);
    const formattedHistory = formatHistory(history);

    const chat = model.startChat({
      history: formattedHistory
    });

    const resultStream = await chat.sendMessageStream(message.trim());
    let accumulatedText = '';

    for await (const chunk of resultStream.stream) {
      if (clientAborted) break;
      const chunkText = chunk.text();
      accumulatedText += chunkText;
      res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
    }

    if (!clientAborted) {
      res.write(`data: ${JSON.stringify({ done: true, fullText: accumulatedText, model: modelName })}\n\n`);
      res.end();

      // Persist to Supabase in background (if configured)
      logMessageToSupabase({ sessionId, role: 'user', content: message.trim(), model: modelName });
      logMessageToSupabase({ sessionId, role: 'model', content: accumulatedText, model: modelName });
    }
  } catch (error) {
    console.error('Gemini Stream API Error:', error);
    const formatted = formatGeminiError(error);
    if (!res.headersSent) {
      res.status(formatted.status).json({ error: formatted.error });
    } else {
      res.write(`data: ${JSON.stringify({ error: formatted.error })}\n\n`);
      res.end();
    }
  }
});

// Fallback route to serve index.html for SPA/frontend navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }
  next();
});

// Start Server
app.listen(PORT, () => {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  const hasSupabase = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

  console.log(`\n======================================================`);
  console.log(`🚀 Gemini Chatbot Server running on http://localhost:${PORT}`);
  console.log(`📁 Backend:  ${__dirname}`);
  console.log(`📁 Frontend: ${frontendPath}`);
  console.log(`🔑 Gemini Key:   ${hasGeminiKey ? 'Configured ✅' : 'Not set in .env (Can be provided in UI) ⚠️'}`);
  console.log(`⚡ Supabase:     ${hasSupabase ? 'Configured ✅ (' + process.env.SUPABASE_URL + ')' : 'Not configured in .env (Optional cloud sync) ⚠️'}`);
  console.log(`======================================================\n`);
});
