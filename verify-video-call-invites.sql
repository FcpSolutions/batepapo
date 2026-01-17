-- Script para verificar e corrigir problemas com convites de vídeo chamada
-- Execute este SQL no SQL Editor do Supabase

-- ========== 1. VERIFICAR SE A TABELA EXISTE ==========
SELECT 
    table_name,
    table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'video_call_invites';

-- Se não retornar nada, execute o arquivo video-call-invites-schema.sql primeiro

-- ========== 2. VERIFICAR ESTRUTURA DA TABELA ==========
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'video_call_invites'
ORDER BY ordinal_position;

-- ========== 3. VERIFICAR POLÍTICAS RLS ==========
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'video_call_invites';

-- Deve haver 4 políticas:
-- 1. "Usuários podem ver seus convites" (SELECT)
-- 2. "Usuários podem criar convites" (INSERT)
-- 3. "Usuários podem responder convites" (UPDATE)
-- 4. "Usuários podem deletar seus convites" (DELETE)

-- ========== 4. VERIFICAR SE RLS ESTÁ HABILITADO ==========
SELECT 
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'video_call_invites';

-- rowsecurity deve ser 'true'

-- ========== 5. TESTAR INSERÇÃO (substitua os IDs pelos seus) ==========
-- Descomente e execute para testar (substitua 'SEU_USER_ID' e 'OUTRO_USER_ID')
-- INSERT INTO video_call_invites (caller_id, recipient_id, status)
-- VALUES ('SEU_USER_ID', 'OUTRO_USER_ID', 'pending')
-- RETURNING *;

-- ========== 6. VERIFICAR CONVITES EXISTENTES ==========
-- Execute como usuário autenticado para ver seus convites
SELECT 
    id,
    caller_id,
    recipient_id,
    status,
    created_at,
    answered_at
FROM video_call_invites
ORDER BY created_at DESC
LIMIT 10;

-- ========== 7. VERIFICAR REALTIME ==========
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'video_call_invites';

-- Se não retornar nada, execute:
-- ALTER PUBLICATION supabase_realtime ADD TABLE video_call_invites;

-- ========== 8. CORRIGIR POLÍTICAS SE NECESSÁRIO ==========
-- Se as políticas não existirem, execute:

-- DROP POLICY IF EXISTS "Usuários podem ver seus convites" ON video_call_invites;
-- DROP POLICY IF EXISTS "Usuários podem criar convites" ON video_call_invites;
-- DROP POLICY IF EXISTS "Usuários podem responder convites" ON video_call_invites;
-- DROP POLICY IF EXISTS "Usuários podem deletar seus convites" ON video_call_invites;

-- CREATE POLICY "Usuários podem ver seus convites"
-- ON video_call_invites FOR SELECT
-- USING (
--     caller_id = auth.uid() OR 
--     recipient_id = auth.uid()
-- );

-- CREATE POLICY "Usuários podem criar convites"
-- ON video_call_invites FOR INSERT
-- WITH CHECK (
--     caller_id = auth.uid() AND
--     recipient_id != auth.uid()
-- );

-- CREATE POLICY "Usuários podem responder convites"
-- ON video_call_invites FOR UPDATE
-- USING (
--     recipient_id = auth.uid() OR
--     caller_id = auth.uid()
-- );

-- CREATE POLICY "Usuários podem deletar seus convites"
-- ON video_call_invites FOR DELETE
-- USING (
--     caller_id = auth.uid() OR
--     recipient_id = auth.uid()
-- );
