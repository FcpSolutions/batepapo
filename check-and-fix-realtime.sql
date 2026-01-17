-- Script para VERIFICAR e CORRIGIR problemas com Realtime
-- Execute este SQL no SQL Editor do Supabase

-- ========== 1. VERIFICAR STATUS ATUAL ==========
-- Verifica quais tabelas estão na publicação Realtime
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ========== 2. VERIFICAR SE AS TABELAS EXISTEM ==========
SELECT 
    table_name,
    table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('messages', 'profiles', 'video_call_invites')
ORDER BY table_name;

-- ========== 3. ADICIONAR VIDEO_CALL_INVITES (SE NÃO ESTIVER) ==========
-- Adiciona apenas video_call_invites, sem mexer nas outras
DO $$
BEGIN
    -- Verifica se a tabela existe
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'video_call_invites'
    ) THEN
        -- Verifica se já está na publicação
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND tablename = 'video_call_invites'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE video_call_invites;
            RAISE NOTICE '✅ video_call_invites adicionada à publicação Realtime';
        ELSE
            RAISE NOTICE 'ℹ️ video_call_invites já está na publicação Realtime';
        END IF;
    ELSE
        RAISE NOTICE '⚠️ Tabela video_call_invites não existe. Execute video-call-invites-schema.sql primeiro.';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Erro: %', SQLERRM;
END $$;

-- ========== 4. VERIFICAR NOVAMENTE ==========
-- Verifica novamente após as alterações
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
