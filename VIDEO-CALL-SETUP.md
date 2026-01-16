# Sistema de Vídeo Chamada - Guia de Configuração

## ✅ O que foi implementado

Sistema completo de convites de vídeo chamada com notificações em tempo real:

1. **Tabela de Convites** (`video_call_invites`)
   - Armazena convites de vídeo chamada
   - Estados: `pending`, `accepted`, `rejected`, `cancelled`, `ended`

2. **Notificações em Tempo Real**
   - Usuário recebe notificação quando é convidado
   - Modal aparece automaticamente com opções de aceitar/recusar

3. **Interface Completa**
   - Modal de notificação com informações do chamador
   - Botões para aceitar ou recusar
   - Integração com modal de vídeo chamada

## 🔧 Configuração no Supabase

### 1. Criar a Tabela de Convites

Execute o arquivo `video-call-invites-schema.sql` no SQL Editor do Supabase:

1. Vá em **SQL Editor**
2. Abra o arquivo `video-call-invites-schema.sql`
3. Copie e cole o conteúdo
4. Execute (Run)

### 2. Habilitar Realtime para Convites

Execute o arquivo `enable-realtime.sql` atualizado (ou execute apenas esta linha):

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE video_call_invites;
```

OU execute no SQL Editor:

```sql
-- Habilita Realtime na tabela video_call_invites
ALTER PUBLICATION supabase_realtime ADD TABLE video_call_invites;
```

### 3. Verificar se está funcionando

Execute esta query para verificar:

```sql
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'video_call_invites';
```

Você deve ver `video_call_invites` na lista.

## 📱 Como Funciona

### Para quem chama:

1. Usuário clica em "Vídeo Chamada" em um chat privado
2. Sistema cria um convite no banco de dados
3. Modal de vídeo chamada abre mostrando "Chamando... Aguardando resposta..."
4. Quando o convidado aceita, o status muda para "Conectado"

### Para quem recebe:

1. Usuário recebe notificação em tempo real via Realtime
2. Modal aparece automaticamente com:
   - Nome e cidade do chamador
   - Botões "Aceitar" e "Recusar"
3. Ao aceitar:
   - Modal de notificação fecha
   - Modal de vídeo chamada abre
   - Câmera e microfone são ativados
4. Ao recusar:
   - Modal fecha
   - Chamador é notificado

## 🎨 Interface

- **Modal de Notificação**: Aparece quando recebe convite
  - Mostra avatar, nome e cidade do chamador
  - Botões estilizados para aceitar (verde) e recusar (vermelho)
  - Animação suave ao aparecer

- **Modal de Vídeo Chamada**: Abre quando chamada é aceita
  - Mostra vídeo local e remoto
  - Controles para ligar/desligar vídeo e áudio
  - Botão para encerrar chamada

## 🔍 Verificar se Está Funcionando

1. Abra o console do navegador (F12)
2. Você deve ver: `✅ Escuta de convites de vídeo chamada ativada`
3. Faça login com dois usuários diferentes
4. Um usuário inicia uma vídeo chamada em chat privado
5. O outro usuário deve receber notificação automaticamente

## 🐛 Troubleshooting

### Notificação não aparece

1. Verifique se o Realtime está habilitado para `video_call_invites`
2. Verifique o console do navegador para erros
3. Verifique se as políticas RLS estão configuradas corretamente

### Erro ao criar convite

1. Verifique se a tabela `video_call_invites` foi criada
2. Verifique se as políticas RLS estão configuradas
3. Verifique se o usuário está autenticado

### Convite não é atualizado

1. Verifique se o Realtime está funcionando
2. Verifique se o canal está inscrito corretamente
3. Verifique o console para erros

## 📝 Notas

- Convites pendentes expiram após 1 hora (função de limpeza automática)
- Apenas um convite pendente por par de usuários (constraint UNIQUE)
- Sistema funciona apenas em chats privados
- WebRTC real não está implementado (apenas simulação de interface)
