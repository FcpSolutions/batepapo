-- Script para adicionar constraint UNIQUE no campo nickname
-- Execute este SQL no SQL Editor do Supabase

-- ========== ADICIONAR CONSTRAINT UNIQUE NO NICKNAME ==========
-- Primeiro, verifica se há apelidos duplicados
SELECT nickname, COUNT(*) as count
FROM profiles
GROUP BY nickname
HAVING COUNT(*) > 1;

-- Se houver duplicatas, você precisará resolvê-las manualmente antes de adicionar a constraint
-- Exemplo de como resolver (escolha uma estratégia):
-- 1. Adicionar sufixo numérico: UPDATE profiles SET nickname = nickname || '_' || id WHERE id IN (...)
-- 2. Ou deletar duplicatas mantendo apenas uma

-- Adiciona a constraint UNIQUE no nickname
-- Se já existir, o comando será ignorado
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_nickname_key' 
        AND conrelid = 'profiles'::regclass
    ) THEN
        ALTER TABLE profiles 
        ADD CONSTRAINT profiles_nickname_key UNIQUE (nickname);
    END IF;
END $$;

-- Cria índice para melhor performance nas buscas por nickname
CREATE INDEX IF NOT EXISTS idx_profiles_nickname ON profiles(nickname);

-- ========== VERIFICAR SE FOI CRIADO ==========
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
AND conname = 'profiles_nickname_key';
