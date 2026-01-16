-- Script para corrigir políticas RLS e criar trigger automático para perfis
-- Execute este SQL no SQL Editor do Supabase

-- ========== REMOVER POLÍTICAS ANTIGAS ==========
DROP POLICY IF EXISTS "Usuários podem inserir próprio perfil" ON profiles;

-- ========== CRIAR FUNÇÃO PARA CRIAR PERFIL ==========
-- Esta função será chamada automaticamente quando um usuário é criado
-- SECURITY DEFINER permite que execute com privilégios elevados, ignorando RLS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, nickname, city, last_activity, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'nickname', 'Usuário'),
        COALESCE(NEW.raw_user_meta_data->>'city', 'São Paulo'),
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== CRIAR TRIGGER ==========
-- Cria o perfil automaticamente quando um usuário é criado no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ========== NOVA POLÍTICA RLS PARA INSERT ==========
-- Permite que usuários insiram seu próprio perfil
CREATE POLICY "Usuários podem inserir próprio perfil"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ========== POLÍTICA ALTERNATIVA (se a anterior não funcionar) ==========
-- Esta política permite inserção se o id corresponde ao usuário autenticado
-- ou se está sendo criado via trigger (SECURITY DEFINER)
-- Comentada por padrão, descomente se necessário
/*
DROP POLICY IF EXISTS "Permitir inserção de perfil" ON profiles;
CREATE POLICY "Permitir inserção de perfil"
    ON profiles FOR INSERT
    WITH CHECK (
        auth.uid() = id OR
        auth.role() = 'service_role'
    );
*/

-- ========== VERIFICAR SE FUNCIONOU ==========
-- Execute este SELECT para verificar se as políticas estão corretas
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles';
