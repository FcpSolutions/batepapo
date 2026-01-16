-- Script para configurar Storage e políticas RLS para mídias
-- Execute este SQL no SQL Editor do Supabase

-- ========== IMPORTANTE: CRIAR O BUCKET PRIMEIRO ==========
-- 1. Vá em Storage no menu lateral do Supabase
-- 2. Clique em "Create a new bucket"
-- 3. Nome: "media"
-- 4. Public bucket: MARCADO (público) - Isso permite que as imagens sejam acessíveis via URL pública
--    OU deixe privado e use signed URLs (o código já suporta ambos)
-- 5. Clique em "Create bucket"

-- ========== VERIFICAR SE O BUCKET EXISTE ==========
-- Execute esta query para verificar se o bucket 'media' existe
SELECT name, id, public
FROM storage.buckets
WHERE name = 'media';

-- Se não retornar nenhuma linha, você precisa criar o bucket manualmente no Dashboard

-- ========== CONFIGURAR POLÍTICAS RLS DO STORAGE ==========

-- Remove políticas antigas se existirem (para evitar conflitos)
DROP POLICY IF EXISTS "Usuários podem fazer upload em sua pasta" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem ler mídias" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem deletar suas mídias" ON storage.objects;

-- Política de UPLOAD (INSERT)
-- Permite que usuários façam upload apenas em sua própria pasta (userId/)
CREATE POLICY "Usuários podem fazer upload em sua pasta"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'media' AND
    (string_to_array(name, '/'))[1] = auth.uid()::text
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
    (string_to_array(name, '/'))[1] = auth.uid()::text
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
AND policyname LIKE '%mídia%' OR policyname LIKE '%upload%' OR policyname LIKE '%pasta%';

-- Você deve ver 3 políticas listadas
