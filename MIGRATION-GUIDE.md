# Guia de Migração para Supabase

Este guia mostra como atualizar `script.js` e `chat.js` para usar Supabase ao invés de localStorage.

## 📝 Arquivos Criados

1. **supabase-config.js** - Configuração do cliente Supabase
2. **supabase-service.js** - Serviço com todas as funções do Supabase
3. **database-schema.sql** - Schema do banco de dados

## 🔄 Mudanças Necessárias

### 1. Atualizar `script.js` (Autenticação)

**Antes (localStorage):**
```javascript
handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const user = this.users.find(u => u.email === email && u.password === password);
    // ...
}
```

**Depois (Supabase):**
```javascript
async handleLogin() {
    try {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        const { user, profile } = await supabaseService.signIn(email, password);
        
        // Salva no sessionStorage para uso imediato
        sessionStorage.setItem('currentUser', JSON.stringify({
            id: user.id,
            nickname: profile.nickname,
            email: profile.email,
            city: profile.city
        }));
        
        window.location.href = 'chat.html';
    } catch (error) {
        this.showError(error.message || 'Erro ao fazer login');
    }
}
```

### 2. Atualizar `script.js` (Cadastro)

**Antes:**
```javascript
handleRegister() {
    // Cria usuário localmente
    const newUser = { id: Date.now().toString(), ... };
    this.users.push(newUser);
    localStorage.setItem('chatUsers', JSON.stringify(this.users));
}
```

**Depois:**
```javascript
async handleRegister() {
    try {
        const nickname = document.getElementById('registerNickname').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const city = document.getElementById('registerCity').value.trim();
        
        const { user, profile } = await supabaseService.signUp(email, password, nickname, city);
        
        // Salva no sessionStorage
        sessionStorage.setItem('currentUser', JSON.stringify({
            id: user.id,
            nickname: profile.nickname,
            email: profile.email,
            city: profile.city
        }));
        
        window.location.href = 'chat.html';
    } catch (error) {
        this.showError(error.message || 'Erro ao cadastrar');
    }
}
```

### 3. Atualizar `chat.js` (Carregar Mensagens)

**Antes:**
```javascript
loadMessages() {
    this.messages = JSON.parse(localStorage.getItem('chatMessages')) || [];
    // ...
}
```

**Depois:**
```javascript
async loadMessages() {
    try {
        if (this.chatMode === 'public') {
            const messages = await supabaseService.getPublicMessages(100);
            this.messages = messages.reverse(); // Inverte para ordem cronológica
        } else if (this.chatMode === 'private') {
            const messages = await supabaseService.getPrivateMessages(
                this.currentUser.id,
                this.privateChatWith,
                100
            );
            this.messages = messages.reverse();
        }
        
        this.displayMessages();
    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
    }
}
```

### 4. Atualizar `chat.js` (Enviar Mensagem)

**Antes:**
```javascript
sendMessage() {
    const message = { ... };
    this.messages.push(message);
    localStorage.setItem('chatMessages', JSON.stringify(this.messages));
}
```

**Depois:**
```javascript
async sendMessage(content = null, mediaType = null, mediaData = null) {
    try {
        const messageInput = document.getElementById('messageInput');
        const textContent = content || messageInput.value.trim();
        
        if (!textContent && !mediaData) return;
        
        let mediaUrl = null;
        
        // Se houver mídia, faz upload primeiro
        if (mediaData && mediaType) {
            // Converte base64 para File (se necessário)
            const file = await this.base64ToFile(mediaData, mediaType);
            const messageId = Date.now().toString();
            mediaUrl = await supabaseService.uploadMedia(file, this.currentUser.id, messageId);
        }
        
        const messageData = {
            user_id: this.currentUser.id,
            recipient_id: this.chatMode === 'private' ? this.privateChatWith : null,
            content: textContent || null,
            type: this.chatMode,
            media_type: mediaType || null,
            media_url: mediaUrl || null
        };
        
        const message = await supabaseService.sendMessage(messageData);
        this.displayMessage(message);
        
        if (!content) {
            messageInput.value = '';
            messageInput.focus();
        }
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        alert('Erro ao enviar mensagem. Tente novamente.');
    }
}
```

### 5. Atualizar `chat.js` (Usuários Online)

**Antes:**
```javascript
loadOnlineUsers() {
    const allUsers = JSON.parse(localStorage.getItem('chatUsers')) || [];
    // ...
}
```

**Depois:**
```javascript
async loadOnlineUsers() {
    try {
        const users = await supabaseService.getOnlineUsers();
        // Filtra o usuário atual
        const otherUsers = users.filter(user => user.id !== this.currentUser.id);
        
        // Atualiza a UI
        this.renderUsersList(otherUsers);
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
    }
}
```

### 6. Atualizar `chat.js` (Limpeza de Dados)

**Antes:**
```javascript
cleanupUserData() {
    this.messages = this.messages.filter(...);
    localStorage.setItem('chatMessages', JSON.stringify(this.messages));
}
```

**Depois:**
```javascript
async cleanupUserData() {
    try {
        // Remove mensagens do usuário
        await supabaseService.deleteUserMessages(this.currentUser.id);
        
        // Remove mídias do usuário
        await supabaseService.deleteUserMedia(this.currentUser.id);
    } catch (error) {
        console.error('Erro ao limpar dados:', error);
    }
}
```

### 7. Adicionar Realtime (Opcional)

Para atualizações em tempo real:

```javascript
initRealtime() {
    // Inscreve-se em novas mensagens
    this.messageChannel = supabaseService.subscribeToMessages((payload) => {
        if (payload.eventType === 'INSERT') {
            const newMessage = payload.new;
            // Verifica se a mensagem é relevante para o usuário atual
            if (this.shouldDisplayMessage(newMessage)) {
                this.displayMessage(newMessage);
            }
        }
    });
    
    // Inscreve-se em atualizações de perfis (usuários online)
    this.profileChannel = supabaseService.subscribeToProfiles((payload) => {
        if (payload.eventType === 'UPDATE') {
            this.loadOnlineUsers();
        }
    });
}

shouldDisplayMessage(message) {
    if (this.chatMode === 'public' && message.type === 'public') {
        return true;
    }
    if (this.chatMode === 'private' && message.type === 'private') {
        return (message.user_id === this.currentUser.id || 
                message.recipient_id === this.currentUser.id) &&
               (message.user_id === this.privateChatWith || 
                message.recipient_id === this.privateChatWith);
    }
    return false;
}
```

## ⚠️ Importante

1. **Todas as funções que usam Supabase devem ser `async`**
2. **Use `try/catch` para tratar erros**
3. **Atualize `last_activity` periodicamente**
4. **Desinscreva-se dos canais Realtime ao sair**

## 🔄 Ordem de Carregamento dos Scripts

```html
<!-- 1. Biblioteca do Supabase -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

<!-- 2. Configuração -->
<script src="supabase-config.js"></script>

<!-- 3. Serviço -->
<script src="supabase-service.js"></script>

<!-- 4. Seus scripts -->
<script src="script.js"></script>
<script src="chat.js"></script>
```

## 📚 Próximos Passos

1. Configure o Supabase seguindo o `README-SUPABASE.md`
2. Atualize `supabase-config.js` com suas credenciais
3. Execute o `database-schema.sql` no Supabase
4. Atualize `script.js` e `chat.js` conforme este guia
5. Teste todas as funcionalidades
