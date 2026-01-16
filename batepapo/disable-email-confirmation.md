# Como Desabilitar Confirmação de E-mail no Supabase

## Método 1: Via Dashboard (Recomendado)

1. Acesse o **Supabase Dashboard**
2. Vá em **Authentication** > **Settings**
3. Role até a seção **Email Auth**
4. Desmarque a opção **"Enable email confirmations"**
5. Clique em **Save**

Isso desabilitará a necessidade de confirmação de e-mail para novos usuários.

## Método 2: Via SQL (Alternativo)

Se preferir fazer via SQL, você pode atualizar as configurações:

```sql
-- Desabilita confirmação de e-mail (requer privilégios de admin)
UPDATE auth.config 
SET enable_signup = true,
    enable_email_confirmations = false;
```

**Nota:** Este método pode não estar disponível dependendo da versão do Supabase.

## Verificação

Após desabilitar:
1. Tente criar uma nova conta
2. O usuário deve ser criado e poder fazer login imediatamente
3. Não deve aparecer mensagem pedindo confirmação de e-mail

## Importante

- Usuários criados antes de desabilitar ainda precisarão confirmar o e-mail
- Para usuários existentes, você pode confirmá-los manualmente no Dashboard:
  - Vá em **Authentication** > **Users**
  - Clique no usuário
  - Clique em **"Confirm email"**
