-- Script para verificar se o trigger foi criado
-- Execute este SQL no SQL Editor do Supabase

-- Verifica se a função existe
SELECT 
    proname as function_name,
    prosrc as function_body
FROM pg_proc
WHERE proname = 'handle_new_user';

-- Verifica se o trigger existe
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Se não existir, execute o fix-rls-policies.sql novamente
