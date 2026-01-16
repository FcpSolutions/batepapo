-- Script para habilitar Realtime nas tabelas
-- Execute este SQL no SQL Editor do Supabase

-- ========== HABILITAR REALTIME NAS TABELAS ==========
-- Adiciona as tabelas à publicação Realtime apenas se ainda não estiverem incluídas

DO $$
BEGIN
    -- Habilita Realtime na tabela messages (se ainda não estiver habilitada)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messages;
        RAISE NOTICE 'Realtime habilitado para tabela messages';
    ELSE
        RAISE NOTICE 'Realtime já estava habilitado para tabela messages';
    END IF;

    -- Habilita Realtime na tabela profiles (se ainda não estiver habilitada)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
        RAISE NOTICE 'Realtime habilitado para tabela profiles';
    ELSE
        RAISE NOTICE 'Realtime já estava habilitado para tabela profiles';
    END IF;

    -- Habilita Realtime na tabela video_call_invites (se ainda não estiver habilitada)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'video_call_invites'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE video_call_invites;
        RAISE NOTICE 'Realtime habilitado para tabela video_call_invites';
    ELSE
        RAISE NOTICE 'Realtime já estava habilitado para tabela video_call_invites';
    END IF;
END $$;

-- ========== VERIFICAR SE FOI HABILITADO ==========
-- Execute esta query para verificar quais tabelas têm Realtime habilitado
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Você deve ver 'messages', 'profiles' e 'video_call_invites' na lista

-- ========== NOTA ==========
-- Se você receber um erro dizendo que a tabela já está na publicação,
-- isso significa que o Realtime já está habilitado. Isso é normal!
