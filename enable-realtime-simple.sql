-- Script SIMPLES para habilitar Realtime apenas na tabela video_call_invites
-- Execute este SQL no SQL Editor do Supabase
-- Este script NÃO mexe nas outras tabelas que já estão funcionando

-- ========== HABILITAR REALTIME APENAS PARA VIDEO_CALL_INVITES ==========
-- Adiciona apenas a tabela video_call_invites à publicação Realtime
-- As outras tabelas (messages e profiles) já devem estar habilitadas

-- Tenta adicionar, se já existir, ignora o erro
DO $$
BEGIN
    -- Adiciona video_call_invites se ainda não estiver na publicação
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'video_call_invites'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE video_call_invites;
        RAISE NOTICE '✅ Realtime habilitado para video_call_invites';
    ELSE
        RAISE NOTICE 'ℹ️ Realtime já estava habilitado para video_call_invites';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Erro ao habilitar Realtime: %', SQLERRM;
END $$;

-- ========== VERIFICAR STATUS ==========
-- Execute esta query para verificar quais tabelas têm Realtime habilitado
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Você deve ver pelo menos 'messages', 'profiles' e 'video_call_invites' na lista
