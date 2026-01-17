-- Schema para sinalização WebRTC (troca de ofertas/respostas e ICE candidates)
-- Execute este SQL no SQL Editor do Supabase

-- ========== TABELA DE SINALIZAÇÃO WEBRTC ==========
CREATE TABLE IF NOT EXISTS webrtc_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invite_id UUID NOT NULL REFERENCES video_call_invites(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
    signal_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_invite ON webrtc_signals(invite_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_from_user ON webrtc_signals(from_user_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_to_user ON webrtc_signals(to_user_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_created_at ON webrtc_signals(created_at DESC);

-- ========== POLÍTICAS RLS ==========
ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver sinais onde são remetente ou destinatário
CREATE POLICY "Usuários podem ver seus sinais WebRTC"
ON webrtc_signals FOR SELECT
USING (
    from_user_id = auth.uid() OR 
    to_user_id = auth.uid()
);

-- Usuários podem criar sinais (enviar ofertas/respostas/ICE)
CREATE POLICY "Usuários podem criar sinais WebRTC"
ON webrtc_signals FOR INSERT
WITH CHECK (
    from_user_id = auth.uid()
);

-- Usuários podem deletar seus próprios sinais
CREATE POLICY "Usuários podem deletar seus sinais WebRTC"
ON webrtc_signals FOR DELETE
USING (
    from_user_id = auth.uid() OR
    to_user_id = auth.uid()
);

-- ========== FUNÇÃO PARA LIMPAR SINAIS ANTIGOS ==========
CREATE OR REPLACE FUNCTION cleanup_old_webrtc_signals()
RETURNS void AS $$
BEGIN
    -- Remove sinais com mais de 5 minutos (sinais antigos não são mais úteis)
    DELETE FROM webrtc_signals 
    WHERE created_at < NOW() - INTERVAL '5 minutes';
END;
$$ language 'plpgsql';
