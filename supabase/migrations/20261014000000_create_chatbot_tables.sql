-- ============================================================================
-- Supabase Migration: 20261014000000_create_chatbot_tables.sql
-- Description: Creates chat sessions and messages tables with indexes & RLS policies
-- ============================================================================

-- 1. Create chat_sessions table to manage multiple conversations
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    model TEXT DEFAULT 'gemini-1.5-flash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create messages table for storing conversational turns
CREATE TABLE IF NOT EXISTS public.messages (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT 'default-session',
    role TEXT NOT NULL CHECK (role IN ('user', 'model', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT DEFAULT 'gemini-1.5-flash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create high-performance indexes for fast conversation retrieval
CREATE INDEX IF NOT EXISTS idx_messages_session_created 
ON public.messages (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated 
ON public.chat_sessions (updated_at DESC);

-- 4. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if re-running migration to avoid conflict errors
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Allow public read access to chat_sessions" ON public.chat_sessions;
    DROP POLICY IF EXISTS "Allow public insert to chat_sessions" ON public.chat_sessions;
    DROP POLICY IF EXISTS "Allow public update to chat_sessions" ON public.chat_sessions;
    DROP POLICY IF EXISTS "Allow public delete of chat_sessions" ON public.chat_sessions;
    
    DROP POLICY IF EXISTS "Allow public read access to messages" ON public.messages;
    DROP POLICY IF EXISTS "Allow public insert to messages" ON public.messages;
    DROP POLICY IF EXISTS "Allow public delete of messages" ON public.messages;
END $$;

-- 6. RLS Policies for chat_sessions
CREATE POLICY "Allow public read access to chat_sessions" 
ON public.chat_sessions FOR SELECT USING (true);

CREATE POLICY "Allow public insert to chat_sessions" 
ON public.chat_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update to chat_sessions" 
ON public.chat_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow public delete of chat_sessions" 
ON public.chat_sessions FOR DELETE USING (true);

-- 7. RLS Policies for messages
CREATE POLICY "Allow public read access to messages" 
ON public.messages FOR SELECT USING (true);

CREATE POLICY "Allow public insert to messages" 
ON public.messages FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public delete of messages" 
ON public.messages FOR DELETE USING (true);

-- 8. Add table comments
COMMENT ON TABLE public.chat_sessions IS 'Stores metadata for Gemini chatbot conversation sessions';
COMMENT ON TABLE public.messages IS 'Stores message logs between users and Gemini LLM';
