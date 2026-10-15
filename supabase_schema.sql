-- ============================================================================
-- Supabase SQL Schema for Gemini Chatbot Message Persistence
-- Run this in your Supabase Project's SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Create the messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL DEFAULT 'default-session',
    role TEXT NOT NULL CHECK (role IN ('user', 'model', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT DEFAULT 'gemini-1.5-flash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create index on session_id and created_at for fast conversation loading
CREATE INDEX IF NOT EXISTS idx_messages_session_created 
ON public.messages (session_id, created_at ASC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 4. Create policies for public/anon access (Adjust as needed for production auth)
-- Allow anyone with the anon key to read messages for their session
CREATE POLICY "Allow public read access to messages" 
ON public.messages 
FOR SELECT 
USING (true);

-- Allow anyone with the anon key to insert new messages
CREATE POLICY "Allow public insert to messages" 
ON public.messages 
FOR INSERT 
WITH CHECK (true);

-- Allow anyone with the anon key to delete messages for their session
CREATE POLICY "Allow public delete of messages" 
ON public.messages 
FOR DELETE 
USING (true);

COMMENT ON TABLE public.messages IS 'Stores chat message logs between users and Gemini LLM';
