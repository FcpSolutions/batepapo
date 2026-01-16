-- Schema para convites de vídeo chamada
-- Execute este SQL no SQL Editor do Supabase

-- ========== TABELA DE CONVITES DE VÍDEO CHAMADA ==========
CREATE TABLE IF NOT EXISTS video_call_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    caller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'ended')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_video_call_invites_caller ON video_call_invites(caller_id);
CREATE INDEX IF NOT EXISTS idx_video_call_invites_recipient ON video_call_invites(recipient_id);
CREATE INDEX IF NOT EXISTS idx_video_call_invites_status ON video_call_invites(status);
CREATE INDEX IF NOT EXISTS idx_video_call_invites_recipient_status ON video_call_invites(recipient_id, status);

-- Índice único parcial: garante que só pode haver um convite pendente por par de usuários
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_invite 
ON video_call_invites(caller_id, recipient_id) 
WHERE status = 'pending';

-- ========== POLÍTICAS RLS ==========
ALTER TABLE video_call_invites ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver convites onde são remetente ou destinatário
CREATE POLICY "Usuários podem ver seus convites"
ON video_call_invites FOR SELECT
USING (
    caller_id = auth.uid() OR 
    recipient_id = auth.uid()
);

-- Usuários podem criar convites (enviar convite)
CREATE POLICY "Usuários podem criar convites"
ON video_call_invites FOR INSERT
WITH CHECK (
    caller_id = auth.uid() AND
    recipient_id != auth.uid()
);

-- Usuários podem atualizar convites onde são destinatário (aceitar/recusar)
CREATE POLICY "Usuários podem responder convites"
ON video_call_invites FOR UPDATE
USING (
    recipient_id = auth.uid() OR
    caller_id = auth.uid()
);

-- Usuários podem deletar seus próprios convites
CREATE POLICY "Usuários podem deletar seus convites"
ON video_call_invites FOR DELETE
USING (
    caller_id = auth.uid() OR
    recipient_id = auth.uid()
);

-- ========== FUNÇÃO PARA LIMPAR CONVITES ANTIGOS ==========
CREATE OR REPLACE FUNCTION cleanup_old_video_call_invites()
RETURNS void AS $$
BEGIN
    -- Remove convites com mais de 1 hora que não foram respondidos
    DELETE FROM video_call_invites 
    WHERE status = 'pending' 
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$ language 'plpgsql';
