-- Schema do banco de dados para o sistema de bate-papo
-- Execute este SQL no SQL Editor do Supabase

-- ========== EXTENSÕES ==========
-- Habilita UUID se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== TABELA DE PERFIS ==========
-- Armazena informações dos usuários
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    city TEXT NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_activity ON profiles(last_activity);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ========== TABELA DE MENSAGENS ==========
-- Armazena todas as mensagens (públicas e privadas)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    type TEXT NOT NULL CHECK (type IN ('public', 'private')),
    media_type TEXT CHECK (media_type IN ('image', 'video')),
    media_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_private ON messages(user_id, recipient_id, type) WHERE type = 'private';

-- ========== POLÍTICAS RLS (Row Level Security) ==========

-- Habilita RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
-- Usuários podem ver todos os perfis
CREATE POLICY "Usuários podem ver perfis"
    ON profiles FOR SELECT
    USING (true);

-- Usuários podem atualizar apenas seu próprio perfil
CREATE POLICY "Usuários podem atualizar próprio perfil"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Usuários podem inserir apenas seu próprio perfil
CREATE POLICY "Usuários podem inserir próprio perfil"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Políticas para messages
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

-- ========== FUNÇÕES ==========

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar updated_at
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Função para limpar mensagens antigas (opcional - pode ser executada via cron)
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS void AS $$
BEGIN
    -- Remove mensagens com mais de 30 dias
    DELETE FROM messages 
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ language 'plpgsql';

-- ========== STORAGE BUCKET ==========
-- Nota: O bucket precisa ser criado manualmente no Supabase Dashboard
-- Nome do bucket: 'media'
-- Público: false (privado)
-- Política: Usuários podem fazer upload apenas em sua própria pasta (userId/)

-- Política de storage para upload
-- CREATE POLICY "Usuários podem fazer upload em sua pasta"
--     ON storage.objects FOR INSERT
--     WITH CHECK (
--         bucket_id = 'media' AND
--         (storage.foldername(name))[1] = auth.uid()::text
--     );

-- Política de storage para leitura
-- CREATE POLICY "Usuários podem ler mídias"
--     ON storage.objects FOR SELECT
--     USING (bucket_id = 'media');

-- Política de storage para deleção
-- CREATE POLICY "Usuários podem deletar suas mídias"
--     ON storage.objects FOR DELETE
--     USING (
--         bucket_id = 'media' AND
--         (storage.foldername(name))[1] = auth.uid()::text
--     );
