# Troubleshooting - Usuários Online Não Carregam

## 🔍 Diagnóstico

Se os usuários online não estão aparecendo, siga estes passos:

### 1. Verificar Console do Navegador

Abra o console do navegador (F12) e verifique:

- **Erros de rede**: Procure por erros como "Failed to fetch" ou "NetworkError"
- **Erros de autenticação**: Verifique se o usuário está autenticado
- **Erros de Supabase**: Verifique se há erros relacionados ao Supabase

### 2. Verificar se o Supabase está funcionando

No console, digite:
```javascript
window.supabaseService.isReady()
```

Deve retornar `true`. Se retornar `false`, há um problema de inicialização.

### 3. Verificar se há usuários online no banco

Execute no SQL Editor do Supabase:
```sql
SELECT id, nickname, city, last_activity
FROM profiles
WHERE last_activity > NOW() - INTERVAL '30 minutes'
ORDER BY last_activity DESC;
```

Se não retornar nenhum usuário, significa que não há usuários online (última atividade há mais de 30 minutos).

### 4. Verificar Políticas RLS

Execute no SQL Editor:
```sql
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'profiles';
```

Deve haver pelo menos uma política que permite SELECT para usuários autenticados.

### 5. Verificar Realtime

Execute:
```sql
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'profiles';
```

Deve retornar a linha com `profiles`. Se não retornar, o Realtime não está habilitado para profiles.

## 🔧 Soluções

### Solução 1: Recarregar a Página

Às vezes, um simples refresh resolve problemas temporários:
- Pressione F5 ou Ctrl+R
- Ou feche e abra a aba novamente

### Solução 2: Verificar se o Usuário Está Online

O sistema considera usuários online apenas se `last_activity` foi atualizado nos últimos 30 minutos.

Para forçar um usuário como online, execute:
```sql
UPDATE profiles
SET last_activity = NOW()
WHERE id = 'SEU_USER_ID_AQUI';
```

### Solução 3: Reabilitar Realtime para Profiles

Se o Realtime foi desabilitado acidentalmente:

```sql
-- Verifica se está habilitado
SELECT 1 FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'profiles';

-- Se não retornar nada, habilita:
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

### Solução 4: Verificar Políticas RLS

Se as políticas RLS estiverem bloqueando, execute:

```sql
-- Verifica políticas existentes
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles';

-- Se não houver política de SELECT, cria:
CREATE POLICY "Usuários podem ver perfis"
ON profiles FOR SELECT
USING (true);
```

### Solução 5: Limpar Cache e Recarregar

1. Abra o console (F12)
2. Vá em "Application" > "Local Storage"
3. Limpe todos os dados
4. Recarregue a página
5. Faça login novamente

## 🐛 Erros Comuns

### "Supabase não está pronto"
- **Causa**: Supabase não inicializou corretamente
- **Solução**: Recarregue a página e verifique se há erros no console

### "Failed to fetch"
- **Causa**: Problema de rede ou Supabase offline
- **Solução**: Verifique sua conexão e se o Supabase está acessível

### "permission denied"
- **Causa**: Políticas RLS bloqueando
- **Solução**: Verifique e corrija as políticas RLS

### Lista vazia mas há usuários online
- **Causa**: `last_activity` não está sendo atualizado
- **Solução**: Verifique se `updateActivity()` está sendo chamado

## 📞 Ainda não funciona?

1. Execute o script `check-and-fix-realtime.sql`
2. Verifique os logs no console do navegador
3. Verifique se há erros no SQL Editor do Supabase
4. Tente fazer login com outro usuário para testar
