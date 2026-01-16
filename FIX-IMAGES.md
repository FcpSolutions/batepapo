# Como Corrigir o Problema de Imagens Não Carregarem

## Problema
As imagens não estão carregando mesmo com as políticas RLS configuradas.

## Possíveis Causas

### 1. Bucket Privado vs Público

O código atual usa URL pública por padrão. Se o bucket for **privado**, você precisa:

**Opção A: Tornar o bucket público (RECOMENDADO)**
1. Vá em **Storage** > **Buckets**
2. Clique no bucket `media`
3. Marque **"Public bucket"**
4. Salve

**Opção B: Usar Signed URLs (se quiser manter privado)**
- O código já suporta signed URLs, mas precisa ser ajustado
- Signed URLs expiram após 1 hora

### 2. Verificar se a URL está correta

Abra o console do navegador (F12) e verifique:
1. Se há erros de CORS
2. Se a URL da imagem está correta
3. Se a imagem existe no Storage

### 3. Verificar se o arquivo foi enviado

1. Vá em **Storage** > **Files**
2. Verifique se há arquivos no bucket `media`
3. Verifique se os arquivos estão na estrutura: `userId/messageId.ext`

## Solução Rápida

Se o bucket for **público**, as imagens devem funcionar automaticamente.

Se o bucket for **privado**, você precisa:
1. Tornar o bucket público, OU
2. Ajustar o código para usar signed URLs sempre

## Teste

1. Envie uma nova imagem
2. Verifique no console se a URL foi gerada corretamente
3. Tente acessar a URL diretamente no navegador
4. Se a URL não funcionar, o bucket provavelmente é privado
