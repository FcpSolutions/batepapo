# Integração com Supabase - Guia de Configuração

Este guia explica como configurar o sistema de bate-papo para usar o Supabase como backend.

## 📋 Pré-requisitos

1. Conta no [Supabase](https://supabase.com)
2. Projeto criado no Supabase

## 🔧 Passo a Passo

### 1. Criar Projeto no Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie uma nova conta ou faça login
3. Clique em "New Project"
4. Preencha os dados do projeto:
   - Nome do projeto
   - Senha do banco de dados
   - Região (escolha a mais próxima)
5. Aguarde a criação do projeto (pode levar alguns minutos)

### 2. Desabilitar Confirmação de E-mail (IMPORTANTE)

1. No painel do Supabase, vá em **Authentication** > **Settings**
2. Role até a seção **Email Auth**
3. **Desmarque** a opção **"Enable email confirmations"**
4. Clique em **Save**

Isso permite que usuários façam login imediatamente após o cadastro, sem precisar confirmar o e-mail.

### 3. Configurar o Banco de Dados

1. No painel do Supabase, vá em **SQL Editor**
2. Clique em **New Query**
3. Copie e cole todo o conteúdo do arquivo `database-schema.sql`
4. Clique em **Run** para executar o SQL
5. Verifique se todas as tabelas foram criadas em **Table Editor**

### 3. Configurar Storage (para mídias)

1. No painel do Supabase, vá em **Storage**
2. Clique em **Create a new bucket**
3. Configure:
   - **Name**: `media`
   - **Public bucket**: Desmarcado (privado)
4. Clique em **Create bucket**

### 4. Configurar Políticas de Storage

1. No bucket `media`, vá em **Policies**
2. Adicione as seguintes políticas:

**Política de Upload:**
```sql
CREATE POLICY "Usuários podem fazer upload em sua pasta"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'media' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
```

**Política de Leitura:**
```sql
CREATE POLICY "Usuários podem ler mídias"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');
```

**Política de Deleção:**
```sql
CREATE POLICY "Usuários podem deletar suas mídias"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'media' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
```

### 5. Obter Credenciais

1. No painel do Supabase, vá em **Settings** > **API**
2. Copie:
   - **Project URL** (SUPABASE_URL)
   - **anon public** key (SUPABASE_ANON_KEY)

### 6. Configurar o Código

1. Abra o arquivo `supabase-config.js`
2. Substitua as variáveis:

```javascript
const SUPABASE_URL = 'https://biotoafvuqgtlswlpjrt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpb3RvYWZ2dXFndGxzd2xwanJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTExMjMsImV4cCI6MjA4NDE2NzEyM30.cUX-0lpYPNK4-KLpj5NUSeoA45ZouJBWFPtUbitLPTw';
```

### 7. Testar a Integração

1. Abra o sistema no navegador
2. Tente criar uma conta
3. Verifique no Supabase se o usuário foi criado em:
   - **Authentication** > **Users**
   - **Table Editor** > **profiles**

## 📊 Estrutura do Banco de Dados

### Tabela: `profiles`
- `id` (UUID) - Referência ao auth.users
- `nickname` (TEXT) - Apelido do usuário
- `email` (TEXT) - E-mail do usuário
- `city` (TEXT) - Cidade do usuário
- `last_activity` (TIMESTAMPTZ) - Última atividade
- `created_at` (TIMESTAMPTZ) - Data de criação
- `updated_at` (TIMESTAMPTZ) - Data de atualização

### Tabela: `messages`
- `id` (UUID) - ID da mensagem
- `user_id` (UUID) - ID do remetente
- `recipient_id` (UUID) - ID do destinatário (para mensagens privadas)
- `content` (TEXT) - Conteúdo da mensagem
- `type` (TEXT) - 'public' ou 'private'
- `media_type` (TEXT) - 'image' ou 'video' (opcional)
- `media_url` (TEXT) - URL da mídia (opcional)
- `created_at` (TIMESTAMPTZ) - Data de criação

## 🔐 Segurança (RLS)

O sistema usa Row Level Security (RLS) para garantir que:
- Usuários só veem mensagens públicas ou privadas onde participam
- Usuários só podem deletar suas próprias mensagens
- Usuários só podem atualizar seu próprio perfil

## 📱 Realtime

O sistema está preparado para usar Realtime do Supabase para:
- Atualização automática de mensagens
- Lista de usuários online em tempo real

## 🗑️ Limpeza Automática

O sistema inclui uma função SQL para limpar mensagens antigas:
```sql
SELECT cleanup_old_messages();
```

Você pode configurar um cron job no Supabase para executar isso automaticamente.

## 🐛 Troubleshooting

### Erro: "Supabase não está carregado"
- Verifique se a biblioteca do Supabase está sendo carregada antes dos outros scripts
- Verifique o console do navegador para erros de carregamento

### Erro: "relation does not exist"
- Execute o arquivo `database-schema.sql` novamente
- Verifique se todas as tabelas foram criadas

### Erro: "permission denied"
- Verifique se as políticas RLS estão configuradas corretamente
- Verifique se o usuário está autenticado

### Erro ao fazer upload de mídia
- Verifique se o bucket `media` foi criado
- Verifique se as políticas de storage estão configuradas
- Verifique se o usuário está autenticado

## 📚 Recursos Adicionais

- [Documentação do Supabase](https://supabase.com/docs)
- [Guia de Autenticação](https://supabase.com/docs/guides/auth)
- [Guia de Storage](https://supabase.com/docs/guides/storage)
- [Guia de Realtime](https://supabase.com/docs/guides/realtime)
