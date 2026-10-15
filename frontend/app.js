/**
 * Gemini AI Nexus - Frontend Application Controller
 * Handles conversation state, streaming responses, markdown formatting,
 * syntax highlighting, settings persistence, and Supabase cloud persistence.
 */

(function () {
  'use strict';

  // ==========================================
  // CONFIGURATION & CONSTANTS
  // ==========================================
  const STORAGE_KEYS = {
    API_KEY: 'gemini_nexus_api_key',
    MODEL: 'gemini_nexus_model',
    TEMPERATURE: 'gemini_nexus_temperature',
    SYSTEM_INSTRUCTION: 'gemini_nexus_system_instruction',
    IS_STREAMING: 'gemini_nexus_streaming',
    CHAT_HISTORY: 'gemini_nexus_chat_history',
    SUPABASE_URL: 'gemini_nexus_supabase_url',
    SUPABASE_KEY: 'gemini_nexus_supabase_key',
    SESSION_ID: 'gemini_nexus_session_id'
  };

  // Generate or retrieve persistent session ID
  let currentSessionId = localStorage.getItem(STORAGE_KEYS.SESSION_ID);
  if (!currentSessionId) {
    currentSessionId = 'session_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, currentSessionId);
  }

  // Determine base API URL
  const isServedFromBackend = window.location.protocol.startsWith('http') && window.location.port === '5000';
  const API_BASE = isServedFromBackend || (window.location.protocol.startsWith('http') && !window.location.pathname.endsWith('.html'))
    ? '/api'
    : 'http://localhost:5000/api';

  // ==========================================
  // APPLICATION STATE
  // ==========================================
  const state = {
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
    model: localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-1.5-flash',
    temperature: parseFloat(localStorage.getItem(STORAGE_KEYS.TEMPERATURE) || '0.7'),
    systemInstruction: localStorage.getItem(STORAGE_KEYS.SYSTEM_INSTRUCTION) || 
      'You are a helpful, brilliant, and concise AI assistant powered by Google Gemini. Answer queries with clarity, structured markdown, and optimal code patterns.',
    isStreaming: localStorage.getItem(STORAGE_KEYS.IS_STREAMING) !== 'false',
    chatHistory: [],
    isGenerating: false,
    activeAbortController: null,
    sessionId: currentSessionId,
    backendStatus: {
      online: false,
      hasServerKey: false,
      hasSupabase: false
    },
    supabase: {
      url: localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '',
      anonKey: localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY) || '',
      client: null,
      connected: false
    }
  };

  // ==========================================
  // DOM ELEMENT REFERENCES
  // ==========================================
  const elements = {
    // Header & Status
    statusBtn: document.getElementById('connection-status-btn'),
    statusDot: document.getElementById('status-dot'),
    statusLabel: document.getElementById('status-label'),
    supabaseStatusBtn: document.getElementById('supabase-status-btn'),
    supabaseStatusDot: document.getElementById('supabase-status-dot'),
    supabaseStatusLabel: document.getElementById('supabase-status-label'),
    modelSelect: document.getElementById('model-select'),
    streamingToggleBtn: document.getElementById('streaming-toggle-btn'),
    cloudSyncBtn: document.getElementById('cloud-sync-btn'),
    clearChatBtn: document.getElementById('clear-chat-btn'),
    exportChatBtn: document.getElementById('export-chat-btn'),
    openSettingsBtn: document.getElementById('open-settings-btn'),

    // Viewport & Containers
    chatViewport: document.getElementById('chat-viewport'),
    welcomeHero: document.getElementById('welcome-hero'),
    quickPromptsGrid: document.getElementById('quick-prompts-grid'),
    messagesContainer: document.getElementById('messages-container'),
    typingIndicator: document.getElementById('typing-indicator'),

    // Input & Footer
    alertBanner: document.getElementById('alert-banner'),
    alertText: document.getElementById('alert-text'),
    alertActionBtn: document.getElementById('alert-action-btn'),
    chatForm: document.getElementById('chat-form'),
    userInput: document.getElementById('user-input'),
    charCount: document.getElementById('char-count'),
    sendBtn: document.getElementById('send-btn'),
    stopGenBtn: document.getElementById('stop-generation-btn'),
    keyStatusHint: document.getElementById('key-status-hint'),
    cloudSyncStatusHint: document.getElementById('cloud-sync-status-hint'),

    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    apiKeyInput: document.getElementById('api-key-input'),
    toggleKeyVisibilityBtn: document.getElementById('toggle-key-visibility-btn'),
    validateKeyBtn: document.getElementById('validate-key-btn'),
    validationMsg: document.getElementById('validation-message'),
    
    // Supabase Settings
    supabaseUrlInput: document.getElementById('supabase-url-input'),
    supabaseKeyInput: document.getElementById('supabase-key-input'),
    toggleSupabaseKeyBtn: document.getElementById('toggle-supabase-key-btn'),
    testSupabaseBtn: document.getElementById('test-supabase-btn'),
    modalSyncSupabaseBtn: document.getElementById('modal-sync-supabase-btn'),
    supabaseValidationMsg: document.getElementById('supabase-validation-message'),

    // Persona & Temp
    systemInstructionInput: document.getElementById('system-instruction-input'),
    personaChips: document.getElementById('persona-chips'),
    tempSlider: document.getElementById('temperature-slider'),
    tempDisplay: document.getElementById('temp-display'),
    tempDesc: document.getElementById('temp-desc'),

    // Toasts
    toastContainer: document.getElementById('toast-container')
  };

  // ==========================================
  // MARKDOWN SETUP
  // ==========================================
  function setupMarkdown() {
    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();

      renderer.code = function (code, lang) {
        const language = lang || 'plaintext';
        let highlighted = code;
        if (typeof hljs !== 'undefined') {
          try {
            if (hljs.getLanguage(language)) {
              highlighted = hljs.highlight(code, { language }).value;
            } else {
              highlighted = hljs.highlightAuto(code).value;
            }
          } catch (e) {
            highlighted = code;
          }
        }

        return `
          <div class="code-block-wrapper">
            <div class="code-block-header">
              <span class="code-lang-tag">${escapeHtml(language)}</span>
              <button type="button" class="copy-code-btn" data-code="${encodeURIComponent(code)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy Code</span>
              </button>
            </div>
            <pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>
          </div>
        `;
      };

      marked.setOptions({
        renderer: renderer,
        gfm: true,
        breaks: true,
        headerIds: false
      });
    }
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================
  async function init() {
    setupMarkdown();
    bindEvents();
    loadStoredSettings();
    loadStoredHistory();
    await checkBackendHealth();
    await loadServerConfig();
    initializeSupabaseClient();
    adjustTextareaHeight();
  }

  function loadStoredSettings() {
    elements.modelSelect.value = state.model;
    elements.apiKeyInput.value = state.apiKey;
    elements.supabaseUrlInput.value = state.supabase.url;
    elements.supabaseKeyInput.value = state.supabase.anonKey;
    elements.systemInstructionInput.value = state.systemInstruction;
    elements.tempSlider.value = state.temperature;
    elements.tempDisplay.textContent = state.temperature.toFixed(1);
    updateTemperatureLabel(state.temperature);

    if (state.isStreaming) {
      elements.streamingToggleBtn.classList.add('active');
    } else {
      elements.streamingToggleBtn.classList.remove('active');
    }
  }

  function loadStoredHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      if (stored) {
        state.chatHistory = JSON.parse(stored);
        if (Array.isArray(state.chatHistory) && state.chatHistory.length > 0) {
          elements.welcomeHero.classList.add('hidden');
          renderAllMessages();
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored chat history:', e);
      state.chatHistory = [];
    }
  }

  function persistHistory() {
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(state.chatHistory));
    } catch (e) {
      console.warn('Could not persist history:', e);
    }
  }

  // ==========================================
  // BACKEND & SUPABASE CONFIG LOADER
  // ==========================================
  async function checkBackendHealth() {
    elements.statusDot.className = 'status-dot checking';
    elements.statusLabel.textContent = 'Connecting...';

    try {
      const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      state.backendStatus.online = true;
      state.backendStatus.hasServerKey = Boolean(data.hasServerKey);
      state.backendStatus.hasSupabase = Boolean(data.hasSupabase);

      updateKeyStatusIndicators();
    } catch (error) {
      console.error('Health check failed:', error);
      state.backendStatus.online = false;
      elements.statusDot.className = 'status-dot error';
      elements.statusLabel.textContent = 'Backend Offline';
      elements.keyStatusHint.textContent = 'Server: Offline (run `npm start`)';
      showAlertBanner('Cannot connect to backend server. Make sure it is running on port 5000.', true);
    }
  }

  async function loadServerConfig() {
    try {
      const res = await fetch(`${API_BASE}/config`, { cache: 'no-store' });
      if (res.ok) {
        const config = await res.json();
        // If client does not have Supabase credentials in localStorage, inherit from server .env
        if (!state.supabase.url && config.supabaseUrl) {
          state.supabase.url = config.supabaseUrl;
          elements.supabaseUrlInput.value = config.supabaseUrl;
        }
        if (!state.supabase.anonKey && config.supabaseAnonKey) {
          state.supabase.anonKey = config.supabaseAnonKey;
          elements.supabaseKeyInput.value = config.supabaseAnonKey;
        }
        updateSupabaseStatusIndicators();
      }
    } catch (e) {
      console.warn('Could not load server config:', e);
    }
  }

  function initializeSupabaseClient() {
    if (typeof window.supabase !== 'undefined' && state.supabase.url && state.supabase.anonKey) {
      try {
        state.supabase.client = window.supabase.createClient(state.supabase.url, state.supabase.anonKey);
        state.supabase.connected = true;
        updateSupabaseStatusIndicators();
      } catch (err) {
        console.warn('Supabase client error:', err);
      }
    } else {
      updateSupabaseStatusIndicators();
    }
  }

  function updateKeyStatusIndicators() {
    const hasKey = state.apiKey.trim().length > 0 || state.backendStatus.hasServerKey;

    if (hasKey) {
      elements.statusDot.className = 'status-dot online';
      elements.statusLabel.textContent = state.apiKey ? 'Ready (Local Key)' : 'Ready (Server Key)';
      elements.keyStatusHint.textContent = state.apiKey ? 'Key: Client Configured' : 'Key: Server Configured';
      hideAlertBanner();
    } else {
      elements.statusDot.className = 'status-dot warning';
      elements.statusLabel.textContent = 'API Key Needed';
      elements.keyStatusHint.textContent = 'API Key: Missing';
      showAlertBanner('Gemini API Key missing. Click here to configure your free key.', false);
    }
  }

  function updateSupabaseStatusIndicators() {
    const isConfigured = Boolean((state.supabase.url && state.supabase.anonKey) || state.backendStatus.hasSupabase);

    if (isConfigured) {
      elements.supabaseStatusDot.className = 'status-dot supabase-online';
      elements.supabaseStatusLabel.textContent = 'Supabase: Ready';
      if (elements.cloudSyncStatusHint) {
        elements.cloudSyncStatusHint.textContent = 'Supabase: Sync Active';
        elements.cloudSyncStatusHint.style.color = '#3ecf8e';
      }
    } else {
      elements.supabaseStatusDot.className = 'status-dot checking';
      elements.supabaseStatusLabel.textContent = 'Supabase';
      if (elements.cloudSyncStatusHint) {
        elements.cloudSyncStatusHint.textContent = 'Supabase: Unconfigured';
        elements.cloudSyncStatusHint.style.color = 'var(--text-muted)';
      }
    }
  }

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function bindEvents() {
    // Model Select
    elements.modelSelect.addEventListener('change', () => {
      state.model = elements.modelSelect.value;
      localStorage.setItem(STORAGE_KEYS.MODEL, state.model);
      showToast(`Model set to ${state.model}`, 'info');
    });

    // Streaming Toggle
    elements.streamingToggleBtn.addEventListener('click', () => {
      state.isStreaming = !state.isStreaming;
      localStorage.setItem(STORAGE_KEYS.IS_STREAMING, state.isStreaming);
      elements.streamingToggleBtn.classList.toggle('active', state.isStreaming);
      showToast(state.isStreaming ? 'Streaming enabled' : 'Streaming disabled', 'info');
    });

    // Cloud Sync Buttons
    elements.cloudSyncBtn.addEventListener('click', syncMessagesFromSupabase);
    elements.modalSyncSupabaseBtn.addEventListener('click', syncMessagesFromSupabase);

    // Clear Chat
    elements.clearChatBtn.addEventListener('click', async () => {
      if (state.chatHistory.length === 0) return;
      if (confirm('Are you sure you want to clear the conversation?')) {
        state.chatHistory = [];
        persistHistory();
        elements.messagesContainer.innerHTML = '';
        elements.welcomeHero.classList.remove('hidden');

        // If Supabase configured, clear remote session
        if (state.backendStatus.hasSupabase || state.supabase.client) {
          fetch(`${API_BASE}/chats?sessionId=${encodeURIComponent(state.sessionId)}`, { method: 'DELETE' }).catch(() => {});
        }

        showToast('Chat history cleared', 'info');
      }
    });

    // Export Chat
    elements.exportChatBtn.addEventListener('click', exportChatAsMarkdown);

    // Settings Modal Triggers
    elements.openSettingsBtn.addEventListener('click', openSettingsModal);
    elements.statusBtn.addEventListener('click', openSettingsModal);
    elements.supabaseStatusBtn.addEventListener('click', openSettingsModal);
    elements.alertActionBtn.addEventListener('click', openSettingsModal);
    elements.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    elements.cancelSettingsBtn.addEventListener('click', closeSettingsModal);
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) closeSettingsModal();
    });

    // Save Settings
    elements.saveSettingsBtn.addEventListener('click', saveSettingsFromModal);

    // Toggle Key Visibility Buttons
    elements.toggleKeyVisibilityBtn.addEventListener('click', () => {
      const current = elements.apiKeyInput.type;
      elements.apiKeyInput.type = current === 'password' ? 'text' : 'password';
    });
    elements.toggleSupabaseKeyBtn.addEventListener('click', () => {
      const current = elements.supabaseKeyInput.type;
      elements.supabaseKeyInput.type = current === 'password' ? 'text' : 'password';
    });

    // Validate Keys
    elements.validateKeyBtn.addEventListener('click', testApiKey);
    elements.testSupabaseBtn.addEventListener('click', testSupabaseConnection);

    // Persona Chips
    elements.personaChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.persona-chip');
      if (!chip) return;
      elements.personaChips.querySelectorAll('.persona-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      elements.systemInstructionInput.value = chip.dataset.instruction || '';
    });

    // Temperature Slider
    elements.tempSlider.addEventListener('input', () => {
      const val = parseFloat(elements.tempSlider.value);
      elements.tempDisplay.textContent = val.toFixed(1);
      updateTemperatureLabel(val);
    });

    // User Textarea Input
    elements.userInput.addEventListener('input', () => {
      adjustTextareaHeight();
      updateCharCount();
    });

    elements.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Chat Form Submit
    elements.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });

    // Stop Generation
    elements.stopGenBtn.addEventListener('click', () => {
      if (state.activeAbortController) {
        state.activeAbortController.abort();
        state.activeAbortController = null;
        setGeneratingState(false);
        showToast('Generation stopped', 'info');
      }
    });

    // Quick Prompts
    elements.quickPromptsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.prompt-card');
      if (!card) return;
      const prompt = card.dataset.prompt;
      if (prompt) {
        elements.userInput.value = prompt;
        adjustTextareaHeight();
        updateCharCount();
        sendMessage();
      }
    });

    // Message Action Delegates
    elements.messagesContainer.addEventListener('click', (e) => {
      const copyCodeBtn = e.target.closest('.copy-code-btn');
      if (copyCodeBtn) {
        const rawCode = decodeURIComponent(copyCodeBtn.dataset.code || '');
        copyToClipboard(rawCode, copyCodeBtn, 'Copied!');
        return;
      }

      const copyMsgBtn = e.target.closest('.copy-msg-btn');
      if (copyMsgBtn) {
        const text = decodeURIComponent(copyMsgBtn.dataset.content || '');
        copyToClipboard(text, copyMsgBtn, 'Message copied');
        return;
      }

      const retryBtn = e.target.closest('.retry-msg-btn');
      if (retryBtn) {
        const lastUserMsg = [...state.chatHistory].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          if (state.chatHistory[state.chatHistory.length - 1]?.role === 'model') {
            state.chatHistory.pop();
            persistHistory();
            renderAllMessages();
          }
          dispatchChatRequest(lastUserMsg.content);
        }
      }
    });
  }

  // ==========================================
  // SUPABASE ACTIONS
  // ==========================================
  async function testSupabaseConnection() {
    const url = elements.supabaseUrlInput.value.trim();
    const key = elements.supabaseKeyInput.value.trim();

    elements.supabaseValidationMsg.className = 'validation-message';
    elements.supabaseValidationMsg.textContent = 'Testing Supabase...';

    try {
      const res = await fetch(`${API_BASE}/supabase/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url || undefined, key: key || undefined })
      });

      const data = await res.json();
      if (res.ok && data.connected) {
        elements.supabaseValidationMsg.className = 'validation-message success';
        elements.supabaseValidationMsg.textContent = data.tableExists ? '✓ Connected to Supabase & Verified!' : '✓ Connected! (Run schema to create table)';
        showToast('Supabase connection successful!', 'success');
      } else {
        elements.supabaseValidationMsg.className = 'validation-message error';
        elements.supabaseValidationMsg.textContent = `✗ ${data.error || 'Connection failed'}`;
      }
    } catch (err) {
      elements.supabaseValidationMsg.className = 'validation-message error';
      elements.supabaseValidationMsg.textContent = '✗ Connection test failed';
    }
  }

  async function syncMessagesFromSupabase() {
    showToast('Fetching messages from Supabase...', 'info');

    try {
      const res = await fetch(`${API_BASE}/chats?sessionId=${encodeURIComponent(state.sessionId)}`);
      const data = await res.json();

      if (res.ok && Array.isArray(data.messages)) {
        if (data.messages.length === 0) {
          showToast('No saved cloud messages found for this session.', 'info');
          return;
        }

        // Merge or replace messages
        state.chatHistory = data.messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

        persistHistory();
        elements.welcomeHero.classList.add('hidden');
        renderAllMessages();
        showToast(`Loaded ${data.messages.length} messages from Supabase!`, 'success');
      } else {
        showToast(data.error || 'Could not fetch messages from Supabase', 'error');
      }
    } catch (e) {
      showToast('Error syncing with Supabase: ' + e.message, 'error');
    }
  }

  // ==========================================
  // UI & MODAL MANAGEMENT
  // ==========================================
  function openSettingsModal() {
    elements.apiKeyInput.value = state.apiKey;
    elements.supabaseUrlInput.value = state.supabase.url;
    elements.supabaseKeyInput.value = state.supabase.anonKey;
    elements.systemInstructionInput.value = state.systemInstruction;
    elements.tempSlider.value = state.temperature;
    elements.tempDisplay.textContent = state.temperature.toFixed(1);
    updateTemperatureLabel(state.temperature);
    elements.validationMsg.textContent = '';
    elements.supabaseValidationMsg.textContent = '';
    elements.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    elements.settingsModal.classList.add('hidden');
  }

  function saveSettingsFromModal() {
    state.apiKey = elements.apiKeyInput.value.trim();
    state.supabase.url = elements.supabaseUrlInput.value.trim();
    state.supabase.anonKey = elements.supabaseKeyInput.value.trim();
    state.systemInstruction = elements.systemInstructionInput.value.trim();
    state.temperature = parseFloat(elements.tempSlider.value);

    localStorage.setItem(STORAGE_KEYS.API_KEY, state.apiKey);
    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, state.supabase.url);
    localStorage.setItem(STORAGE_KEYS.SUPABASE_KEY, state.supabase.anonKey);
    localStorage.setItem(STORAGE_KEYS.SYSTEM_INSTRUCTION, state.systemInstruction);
    localStorage.setItem(STORAGE_KEYS.TEMPERATURE, state.temperature.toString());

    initializeSupabaseClient();
    updateKeyStatusIndicators();
    updateSupabaseStatusIndicators();
    closeSettingsModal();
    showToast('All settings saved successfully', 'success');
  }

  async function testApiKey() {
    const key = elements.apiKeyInput.value.trim();
    elements.validationMsg.className = 'validation-message';
    elements.validationMsg.textContent = 'Testing key...';

    try {
      const res = await fetch(`${API_BASE}/validate-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': key
        },
        body: JSON.stringify({ apiKey: key })
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        elements.validationMsg.className = 'validation-message success';
        elements.validationMsg.textContent = '✓ Key is active & valid!';
      } else {
        elements.validationMsg.className = 'validation-message error';
        elements.validationMsg.textContent = `✗ ${data.error || 'Invalid API key'}`;
      }
    } catch (e) {
      elements.validationMsg.className = 'validation-message error';
      elements.validationMsg.textContent = '✗ Connection error testing key';
    }
  }

  function updateTemperatureLabel(val) {
    if (val <= 0.3) elements.tempDesc.textContent = 'Precise & Deterministic';
    else if (val <= 0.8) elements.tempDesc.textContent = 'Balanced & Conversational';
    else elements.tempDesc.textContent = 'Creative & Imaginative';
  }

  function adjustTextareaHeight() {
    const el = elements.userInput;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function updateCharCount() {
    const len = elements.userInput.value.length;
    elements.charCount.textContent = `${len} / 4000`;
  }

  function showAlertBanner(msg, isError = false) {
    elements.alertText.textContent = msg;
    elements.alertBanner.classList.toggle('error', isError);
    elements.alertBanner.classList.remove('hidden');
  }

  function hideAlertBanner() {
    elements.alertBanner.classList.add('hidden');
  }

  function setGeneratingState(generating) {
    state.isGenerating = generating;
    elements.sendBtn.disabled = generating;
    elements.userInput.disabled = generating;
    elements.stopGenBtn.classList.toggle('hidden', !generating);
    elements.typingIndicator.classList.toggle('hidden', !generating);
    if (!generating) {
      elements.userInput.focus();
    }
  }

  function scrollToBottom() {
    elements.chatViewport.scrollTop = elements.chatViewport.scrollHeight;
  }

  // ==========================================
  // CHAT RENDERING
  // ==========================================
  function renderAllMessages() {
    elements.messagesContainer.innerHTML = '';
    state.chatHistory.forEach(item => {
      appendMessageToDOM(item.role, item.content, item.timestamp, false);
    });
    scrollToBottom();
  }

  function appendMessageToDOM(role, content, timestamp = new Date().toLocaleTimeString(), shouldAnimate = true) {
    const row = document.createElement('div');
    row.className = `message-row ${role === 'user' ? 'user' : 'bot'}`;
    if (!shouldAnimate) row.style.animation = 'none';

    if (role === 'user') {
      row.innerHTML = `
        <div class="message-content-wrapper">
          <div class="message-bubble">${escapeHtml(content)}</div>
          <div class="message-meta">
            <span>${escapeHtml(timestamp)}</span>
            <button type="button" class="copy-msg-btn" data-content="${encodeURIComponent(content)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
      `;
    } else {
      const parsedHtml = renderMarkdown(content);
      row.innerHTML = `
        <div class="message-avatar bot-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="url(#bot-bubble-sparkle)" />
            <defs>
              <linearGradient id="bot-bubble-sparkle" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stop-color="#38bdf8" />
                <stop offset="0.5" stop-color="#818cf8" />
                <stop offset="1" stop-color="#c084fc" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div class="message-content-wrapper">
          <div class="message-bubble message-markdown-body">${parsedHtml}</div>
          <div class="message-meta">
            <span>${escapeHtml(timestamp)}</span>
            <button type="button" class="copy-msg-btn" data-content="${encodeURIComponent(content)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
            <button type="button" class="retry-msg-btn" title="Regenerate this response">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
              <span>Regenerate</span>
            </button>
          </div>
        </div>
      `;
    }

    elements.messagesContainer.appendChild(row);
    scrollToBottom();
    return row;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(text);
      } catch (e) {
        console.warn('Markdown parsing error:', e);
      }
    }
    return `<p>${escapeHtml(text)}</p>`;
  }

  // ==========================================
  // SEND MESSAGE & STREAMING
  // ==========================================
  async function sendMessage() {
    const rawText = elements.userInput.value.trim();
    if (!rawText || state.isGenerating) return;

    if (!state.apiKey && !state.backendStatus.hasServerKey) {
      openSettingsModal();
      showToast('Please enter your Gemini API Key to continue', 'error');
      return;
    }

    elements.welcomeHero.classList.add('hidden');

    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    state.chatHistory.push({
      role: 'user',
      content: rawText,
      timestamp: userTimestamp
    });
    persistHistory();

    appendMessageToDOM('user', rawText, userTimestamp);

    elements.userInput.value = '';
    adjustTextareaHeight();
    updateCharCount();

    await dispatchChatRequest(rawText);
  }

  async function dispatchChatRequest(promptText) {
    setGeneratingState(true);
    state.activeAbortController = new AbortController();

    const requestPayload = {
      message: promptText,
      history: state.chatHistory.slice(0, -1),
      model: state.model,
      temperature: state.temperature,
      systemInstruction: state.systemInstruction,
      apiKey: state.apiKey || undefined,
      sessionId: state.sessionId
    };

    const headers = { 'Content-Type': 'application/json' };
    if (state.apiKey) headers['x-gemini-key'] = state.apiKey;

    if (state.isStreaming) {
      await handleStreamingResponse(requestPayload, headers);
    } else {
      await handleStandardResponse(requestPayload, headers);
    }
  }

  async function handleStreamingResponse(payload, headers) {
    let botRow = null;
    let bubbleEl = null;
    let accumulatedText = '';
    const botTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: state.activeAbortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned error (${response.status})`);
      }

      elements.typingIndicator.classList.add('hidden');

      botRow = appendMessageToDOM('model', '', botTimestamp);
      bubbleEl = botRow.querySelector('.message-markdown-body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const rawJson = trimmed.slice(6);
            try {
              const data = JSON.parse(rawJson);
              if (data.error) throw new Error(data.error);

              if (data.chunk) {
                accumulatedText += data.chunk;
                bubbleEl.innerHTML = renderMarkdown(accumulatedText);
                scrollToBottom();
              }
              if (data.done) {
                if (data.fullText) accumulatedText = data.fullText;
              }
            } catch (err) {
              if (err.message) throw err;
            }
          }
        }
      }

      finalizeBotResponse(accumulatedText, botRow, botTimestamp);

    } catch (error) {
      if (error.name === 'AbortError') {
        if (accumulatedText && botRow) {
          finalizeBotResponse(accumulatedText + '\n\n*(Generation stopped by user)*', botRow, botTimestamp);
        }
      } else {
        console.error('Streaming error:', error);
        handleRequestError(error, botRow);
      }
    } finally {
      setGeneratingState(false);
      state.activeAbortController = null;
    }
  }

  async function handleStandardResponse(payload, headers) {
    const botTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: state.activeAbortController.signal
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Error ${response.status}`);
      }

      const botRow = appendMessageToDOM('model', data.reply, botTimestamp);
      finalizeBotResponse(data.reply, botRow, botTimestamp);

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Chat error:', error);
        handleRequestError(error);
      }
    } finally {
      setGeneratingState(false);
      state.activeAbortController = null;
    }
  }

  function finalizeBotResponse(text, rowElement, timestamp) {
    if (rowElement) {
      const copyBtn = rowElement.querySelector('.copy-msg-btn');
      if (copyBtn) copyBtn.dataset.content = encodeURIComponent(text);
    }

    state.chatHistory.push({
      role: 'model',
      content: text,
      timestamp
    });
    persistHistory();
  }

  function handleRequestError(error, existingRow = null) {
    const errorMsg = error.message || 'An unexpected error occurred while communicating with Gemini.';
    if (existingRow) {
      const bubble = existingRow.querySelector('.message-markdown-body');
      if (bubble) {
        bubble.innerHTML = `<p style="color: #f87171;"><strong>⚠️ Error:</strong> ${escapeHtml(errorMsg)}</p>`;
      }
    } else {
      appendMessageToDOM('model', `⚠️ **Error:** ${errorMsg}`);
    }
    showToast(errorMsg, 'error');
  }

  // ==========================================
  // UTILITIES & EXPORT
  // ==========================================
  function copyToClipboard(text, triggerBtn, successText = 'Copied!') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        animateCopyButton(triggerBtn, successText);
      }).catch(() => fallbackCopy(text, triggerBtn, successText));
    } else {
      fallbackCopy(text, triggerBtn, successText);
    }
  }

  function fallbackCopy(text, triggerBtn, successText) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      animateCopyButton(triggerBtn, successText);
    } catch (e) {
      showToast('Could not copy to clipboard', 'error');
    }
    document.body.removeChild(textArea);
  }

  function animateCopyButton(btn, text) {
    if (!btn) return;
    const label = btn.querySelector('span');
    const originalText = label ? label.textContent : '';
    btn.classList.add('copied');
    if (label) label.textContent = text;
    showToast(text, 'success');

    setTimeout(() => {
      btn.classList.remove('copied');
      if (label) label.textContent = originalText;
    }, 2000);
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠️' : 'ℹ');
    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  function exportChatAsMarkdown() {
    if (state.chatHistory.length === 0) {
      showToast('No messages to export', 'info');
      return;
    }

    let md = `# Gemini AI Nexus Conversation Export\n`;
    md += `*Exported on ${new Date().toLocaleString()}*\n\n`;
    md += `---\n\n`;

    state.chatHistory.forEach(msg => {
      const author = msg.role === 'user' ? '🧑 User' : '✨ Gemini';
      md += `### ${author} (${msg.timestamp})\n\n`;
      md += `${msg.content}\n\n`;
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a);
    showToast('Conversation exported as Markdown', 'success');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
