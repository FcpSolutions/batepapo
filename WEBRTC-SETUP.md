# Configuração WebRTC para Vídeo Chamadas

Este guia explica como configurar o WebRTC para que os usuários possam ver e ouvir uns aos outros durante as vídeo chamadas.

## ✅ O que foi implementado

1. **Tabela de Sinalização WebRTC** (`webrtc_signals`)
   - Armazena ofertas/respostas SDP e ICE candidates
   - Usa Supabase Realtime para trocar sinais em tempo real

2. **Conexão Peer-to-Peer**
   - Usa RTCPeerConnection para estabelecer conexão direta entre usuários
   - Servidores STUN públicos do Google para NAT traversal

3. **Fluxo Completo**
   - Quando um usuário aceita a chamada, o sistema cria uma conexão WebRTC
   - Os streams de vídeo/áudio são compartilhados entre os peers
   - Cada usuário vê seu próprio vídeo (local) e o vídeo do outro (remoto)

## 🔧 Configuração no Supabase

### 1. Criar a Tabela de Sinalização WebRTC

Execute o arquivo `webrtc-signaling-schema.sql` no SQL Editor do Supabase:

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Abra o arquivo `webrtc-signaling-schema.sql`
4. Copie e cole o conteúdo
5. Execute (Run)

### 2. Habilitar Realtime para Sinais WebRTC

Execute o arquivo `enable-realtime.sql` atualizado (ou execute apenas esta parte):

```sql
-- Habilita Realtime na tabela webrtc_signals
ALTER PUBLICATION supabase_realtime ADD TABLE webrtc_signals;
```

OU execute o script completo `enable-realtime.sql` que já inclui esta configuração.

### 3. Verificar se está funcionando

Execute esta query para verificar:

```sql
SELECT 
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'webrtc_signals';
```

Você deve ver `webrtc_signals` na lista.

## 📱 Como Funciona

### Fluxo de Conexão:

1. **Usuário A inicia chamada:**
   - Solicita acesso à câmera/microfone
   - Cria convite no banco de dados
   - Aguarda resposta

2. **Usuário B aceita chamada:**
   - Solicita acesso à câmera/microfone
   - Cria conexão WebRTC
   - Aguarda oferta do Usuário A

3. **Usuário A envia oferta:**
   - Quando o convite é aceito, cria RTCPeerConnection
   - Cria oferta SDP
   - Envia oferta via Supabase Realtime

4. **Usuário B recebe oferta:**
   - Recebe oferta via Realtime
   - Cria resposta SDP
   - Envia resposta via Supabase Realtime

5. **Troca de ICE candidates:**
   - Ambos os lados trocam ICE candidates
   - Conexão peer-to-peer é estabelecida
   - Streams de vídeo/áudio são compartilhados

## 🎨 Interface

- **Vídeo Local**: Mostra o próprio vídeo (com borda azul)
- **Vídeo Remoto**: Mostra o vídeo do outro usuário (com borda verde)
- **Status**: Mostra "Conectando..." durante a negociação e "Conectado" quando estabelecido

## 🔍 Verificar se Está Funcionando

1. Abra o console do navegador (F12)
2. Você deve ver:
   - `✅ Escuta de sinais WebRTC ativada`
   - `✅ RTCPeerConnection criada`
   - `📤 Enviando oferta WebRTC...`
   - `📹 Stream remoto recebido`
   - `🔌 Estado da conexão: connected`

3. Faça login com dois usuários diferentes
4. Um usuário inicia uma vídeo chamada em chat privado
5. O outro usuário aceita
6. Ambos devem ver seus próprios vídeos e o vídeo do outro

## 🐛 Troubleshooting

### Vídeo não aparece para o outro usuário

1. Verifique se a tabela `webrtc_signals` foi criada
2. Verifique se o Realtime está habilitado para `webrtc_signals`
3. Verifique o console para erros
4. Verifique se as políticas RLS estão configuradas corretamente

### Conexão não estabelece

1. Verifique se os servidores STUN estão acessíveis
2. Alguns firewalls/NATs podem bloquear conexões WebRTC
3. Considere adicionar servidores TURN para casos mais complexos

### Erro ao criar oferta/resposta

1. Verifique se a câmera/microfone foram concedidos
2. Verifique se o stream está ativo
3. Verifique o console para erros específicos

## 📝 Notas

- Os sinais WebRTC são limpos automaticamente após 5 minutos
- A conexão usa servidores STUN públicos (gratuitos)
- Para produção, considere adicionar servidores TURN para melhor compatibilidade
- A conexão é fechada quando a chamada é encerrada
