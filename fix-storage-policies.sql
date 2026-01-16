-- Script para CORRIGIR políticas RLS do Storage
-- Execute este SQL no SQL Editor do Supabase

-- ========== REMOVER POLÍTICAS ANTIGAS ==========
DROP POLICY IF EXISTS "Usuários podem fazer upload em sua pasta" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem ler mídias" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem deletar suas mídias" ON storage.objects;

-- ========== CRIAR POLÍTICAS CORRIGIDAS ==========

-- Política de UPLOAD (INSERT)
-- Permite que usuários façam upload apenas em sua própria pasta (userId/)
-- Usa storage.foldername() que é a função correta do Supabase
CREATE POLICY "Usuários podem fazer upload em sua pasta"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'media' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- Política de LEITURA (SELECT)
-- Permite que todos os usuários autenticados leiam mídias do bucket
CREATE POLICY "Usuários podem ler mídias"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'media' AND
    auth.role() = 'authenticated'
);

-- Política de DELEÇÃO (DELETE)
-- Permite que usuários deletem apenas arquivos de sua própria pasta
CREATE POLICY "Usuários podem deletar suas mídias"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'media' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

-- ========== VERIFICAR SE AS POLÍTICAS FORAM CRIADAS ==========
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND (policyname LIKE '%mídia%' OR policyname LIKE '%upload%' OR policyname LIKE '%pasta%' OR policyname LIKE '%ler%');

-- Você deve ver 3 políticas listadas

-- ========== NOTA IMPORTANTE ==========
-- Se ainda não funcionar, tente esta versão alternativa mais permissiva (apenas para teste):
-- 
-- DROP POLICY IF EXISTS "Usuários podem fazer upload em sua pasta" ON storage.objects;
-- CREATE POLICY "Usuários podem fazer upload em sua pasta"
-- ON storage.objects FOR INSERT
-- WITH CHECK (
--     bucket_id = 'media'
-- );
-- 
-- Isso permite upload de qualquer usuário autenticado no bucket media.
-- Use apenas para testar. Depois, volte para a versão mais restritiva.
