-- Script para verificar e corrigir políticas RLS da tabela messages
-- Execute este SQL no SQL Editor do Supabase

-- ========== VERIFICAR POLÍTICAS EXISTENTES ==========
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
WHERE tablename = 'messages'
ORDER BY policyname;

-- ========== VERIFICAR SE RLS ESTÁ HABILITADO ==========
SELECT 
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'messages';

-- ========== REMOVER POLÍTICAS ANTIGAS (se necessário) ==========
-- Descomente as linhas abaixo se precisar recriar as políticas
/*
DROP POLICY IF EXISTS "Usuários podem ver mensagens públicas" ON messages;
DROP POLICY IF EXISTS "Usuários podem ver mensagens privadas" ON messages;
DROP POLICY IF EXISTS "Usuários podem inserir mensagens" ON messages;
DROP POLICY IF EXISTS "Usuários podem deletar próprias mensagens" ON messages;
*/

-- ========== RECRIAR POLÍTICAS (se necessário) ==========
-- Descomente as linhas abaixo se precisar recriar as políticas
/*
-- Usuários podem ver mensagens públicas
CREATE POLICY "Usuários podem ver mensagens públicas"
    ON messages FOR SELECT
    USING (type = 'public');

-- Usuários podem ver mensagens privadas onde são remetente ou destinatário
CREATE POLICY "Usuários podem ver mensagens privadas"
    ON messages FOR SELECT
    USING (
        type = 'private' AND (
            user_id = auth.uid() OR 
            recipient_id = auth.uid()
        )
    );

-- Usuários podem inserir mensagens
CREATE POLICY "Usuários podem inserir mensagens"
    ON messages FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Usuários podem deletar apenas suas próprias mensagens
CREATE POLICY "Usuários podem deletar próprias mensagens"
    ON messages FOR DELETE
    USING (user_id = auth.uid());
*/

-- ========== TESTAR INSERÇÃO (substitua o UUID pelo ID de um usuário de teste) ==========
-- Descomente e ajuste para testar
/*
-- Primeiro, faça login como um usuário e obtenha seu ID
-- Depois, execute este teste (substitua 'SEU_USER_ID_AQUI' pelo UUID do usuário)
INSERT INTO messages (user_id, content, type)
VALUES ('SEU_USER_ID_AQUI', 'Mensagem de teste', 'public')
RETURNING *;
*/
