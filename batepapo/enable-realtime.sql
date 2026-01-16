-- Script para habilitar Realtime nas tabelas
-- Execute este SQL no SQL Editor do Supabase

-- ========== HABILITAR REALTIME NA TABELA MESSAGES ==========
-- Adiciona a tabela messages à publicação Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ========== HABILITAR REALTIME NA TABELA PROFILES ==========
-- Adiciona a tabela profiles à publicação Realtime (para atualizações de atividade)
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- ========== VERIFICAR SE FOI HABILITADO ==========
-- Execute esta query para verificar quais tabelas têm Realtime habilitado
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Você deve ver 'messages' e 'profiles' na lista

-- ========== NOTA ==========
-- Se você receber um erro dizendo que a tabela já está na publicação,
-- isso significa que o Realtime já está habilitado. Isso é normal!
