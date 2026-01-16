# Validação de Apelido Único

Este documento explica como configurar a validação de apelido único no sistema.

## 📋 O que foi implementado

- ✅ Verificação de apelido duplicado antes de criar novo usuário
- ✅ Verificação de apelido duplicado antes de atualizar perfil
- ✅ Mensagens de erro amigáveis quando apelido já está em uso
- ✅ Constraint UNIQUE no banco de dados (precisa ser aplicada)

## 🔧 Passo a Passo

### 1. Execute o Script SQL no Supabase

1. Acesse o **SQL Editor** no painel do Supabase
2. Abra o arquivo `unique-nickname-constraint.sql`
3. Execute o script completo

**⚠️ IMPORTANTE:** Se houver apelidos duplicados no banco, você precisará resolvê-los antes de aplicar a constraint. O script mostra uma query para identificar duplicatas.

### 2. Verificar se foi aplicado

Após executar o script, execute esta query para verificar:

```sql
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'profiles'::regclass
AND conname = 'profiles_nickname_key';
```

Se retornar uma linha, a constraint foi criada com sucesso!

## 🎯 Como Funciona

### No Cadastro
- Quando um usuário tenta se cadastrar com um apelido que já existe, o sistema verifica antes de criar
- Se o apelido já estiver em uso, mostra a mensagem: "Este apelido já está em uso. Por favor, escolha outro apelido."

### Na Edição de Perfil
- Quando um usuário tenta alterar seu apelido, o sistema verifica se o novo apelido já está em uso por outro usuário
- Se estiver em uso, mostra a mensagem: "Este apelido já está em uso por outro usuário. Por favor, escolha outro apelido."
- O usuário pode manter seu próprio apelido atual (não é considerado duplicata)

### Proteção no Banco de Dados
- A constraint UNIQUE garante que mesmo se houver algum bug no código, o banco de dados não permitirá apelidos duplicados
- Isso adiciona uma camada extra de segurança

## 🔍 Resolver Apelidos Duplicados Existentes

Se você já tem apelidos duplicados no banco, use uma destas estratégias:

### Opção 1: Adicionar sufixo numérico
```sql
UPDATE profiles 
SET nickname = nickname || '_' || SUBSTRING(id::text, 1, 8)
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY nickname ORDER BY created_at) as rn
        FROM profiles
        WHERE nickname IN (
            SELECT nickname FROM profiles 
            GROUP BY nickname 
            HAVING COUNT(*) > 1
        )
    ) t WHERE rn > 1
);
```

### Opção 2: Manter apenas o mais antigo
```sql
DELETE FROM profiles 
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY nickname ORDER BY created_at) as rn
        FROM profiles
        WHERE nickname IN (
            SELECT nickname FROM profiles 
            GROUP BY nickname 
            HAVING COUNT(*) > 1
        )
    ) t WHERE rn > 1
);
```

**⚠️ CUIDADO:** A Opção 2 deleta usuários! Use apenas se tiver certeza.

## ✅ Teste

Após aplicar a constraint, teste:

1. Tente cadastrar um novo usuário com um apelido que já existe
2. Tente editar o perfil para um apelido que já está em uso
3. Verifique se as mensagens de erro aparecem corretamente

## 📝 Notas

- A verificação é feita tanto no código JavaScript quanto no banco de dados
- Isso garante que não haverá apelidos duplicados mesmo em caso de bugs
- O índice criado melhora a performance das buscas por apelido
