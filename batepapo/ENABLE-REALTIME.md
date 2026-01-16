# Como Habilitar Realtime no Supabase

O sistema agora usa **Supabase Realtime** para receber mensagens em tempo real, similar ao WhatsApp. Isso elimina a necessidade de polling constante e faz as mensagens aparecerem instantaneamente.

## 🔧 Configuração no Supabase

### 1. Habilitar Realtime via SQL Editor (RECOMENDADO)

A forma mais simples é executar o script SQL:

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor** (no menu lateral esquerdo)
3. Clique em **New query**
4. Copie e cole o conteúdo do arquivo `enable-realtime.sql`
5. Clique em **Run** (ou pressione Ctrl+Enter)

**OU** execute este SQL diretamente:

```sql
-- Habilita Realtime na tabela messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

### 2. Habilitar Realtime na Tabela `profiles` (opcional, para usuários online)

```sql
-- Habilita Realtime na tabela profiles (para atualizações de atividade)
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

### 3. Verificar se está habilitado

Execute este SQL para verificar:

```sql
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

Você deve ver `messages` e `profiles` na lista.

## ✅ Como Funciona Agora

### Antes (Polling):
- ❌ Sistema verificava novas mensagens a cada 1-3 segundos
- ❌ Causava piscar constante na interface
- ❌ Muitas requisições desnecessárias ao servidor
- ❌ Mensagens apareciam com delay

### Agora (Realtime):
- ✅ Conexão WebSocket constante com Supabase
- ✅ Mensagens aparecem **instantaneamente** quando enviadas
- ✅ Sem piscar na interface
- ✅ Muito menos requisições ao servidor
- ✅ Funciona como WhatsApp - mensagens em tempo real

## 🔍 Verificar se Está Funcionando

1. Abra o console do navegador (F12)
2. Você deve ver: `✅ Realtime conectado - mensagens em tempo real ativadas`
3. Envie uma mensagem de um usuário
4. A mensagem deve aparecer **instantaneamente** para outros usuários

## 🐛 Troubleshooting

### Mensagens não aparecem em tempo real

1. **Verifique se Realtime está habilitado:**
   - Vá em Database > Replication no Supabase
   - Certifique-se de que `messages` está com Realtime ON

2. **Verifique o console do navegador:**
   - Procure por erros relacionados a Realtime
   - Verifique se a mensagem de conexão apareceu

3. **Verifique as políticas RLS:**
   - Execute `verify-messages-rls.sql` para verificar
   - Certifique-se de que as políticas permitem SELECT

### Conexão Realtime não estabelece

1. Verifique se o Supabase está acessível
2. Verifique se há bloqueadores de WebSocket (alguns firewalls bloqueiam)
3. Tente recarregar a página

## 📝 Notas

- O sistema ainda mantém um fallback de polling a cada 30 segundos caso o Realtime falhe
- Mensagens são adicionadas incrementalmente (sem recriar toda a lista)
- O sistema detecta duplicatas automaticamente
