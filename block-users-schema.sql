-- Schema para sistema de bloqueio de usuários
-- Execute este SQL no SQL Editor do Supabase

-- ========== TABELA DE BLOQUEIOS ==========
CREATE TABLE IF NOT EXISTS user_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_unique ON user_blocks(blocker_id, blocked_id);

-- ========== POLÍTICAS RLS ==========
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver seus próprios bloqueios
CREATE POLICY "Usuários podem ver seus bloqueios"
    ON user_blocks FOR SELECT
    USING (blocker_id = auth.uid());

-- Usuários podem criar bloqueios
CREATE POLICY "Usuários podem criar bloqueios"
    ON user_blocks FOR INSERT
    WITH CHECK (blocker_id = auth.uid());

-- Usuários podem remover seus próprios bloqueios
CREATE POLICY "Usuários podem remover seus bloqueios"
    ON user_blocks FOR DELETE
    USING (blocker_id = auth.uid());

-- ========== FUNÇÃO PARA VERIFICAR SE USUÁRIO ESTÁ BLOQUEADO ==========
CREATE OR REPLACE FUNCTION is_user_blocked(blocker_uuid UUID, blocked_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_blocks
        WHERE blocker_id = blocker_uuid
        AND blocked_id = blocked_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========== VERIFICAR SE FOI CRIADO ==========
SELECT 
    schemaname,
    tablename,
    policyname
FROM pg_policies
WHERE tablename = 'user_blocks';
