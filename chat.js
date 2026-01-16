// Gerenciamento do chat
class ChatManager {
    constructor() {
        this.messages = JSON.parse(localStorage.getItem('chatMessages')) || [];
        this.currentUser = JSON.parse(sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser'));
        this.onlineUsers = new Set();
        this.chatMode = 'public'; // 'public' ou 'private'
        this.privateChatWith = null; // ID do usuário com quem está conversando privadamente
        this.inactivityTimeout = null; // Timeout de inatividade
        this.lastActivityTime = Date.now(); // Timestamp da última atividade
        this.INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutos em milissegundos
        this.blockedUsers = []; // Lista de IDs de usuários bloqueados
        this.lastUsersList = null; // Armazena o estado anterior da lista de usuários para evitar re-renderizações desnecessárias
        this.init();
    }

    init() {
        if (!this.currentUser) {
            window.location.href = 'index.html';
            return;
        }

        // Exibe informações do usuário atual
        document.getElementById('currentUserNickname').textContent = this.currentUser.nickname;
        document.getElementById('currentUserCity').textContent = this.currentUser.city;

        // Adiciona usuário atual aos online
        this.onlineUsers.add(this.currentUser.id);
        
        // Carrega mensagens existentes
        this.loadMessages();

        // Carrega lista de usuários bloqueados
        this.loadBlockedUsers();

        // Carrega lista de usuários online
        this.loadOnlineUsers(true); // Força atualização inicial

        // Configura eventos
        this.setupEventListeners();

        // Inicia monitoramento de inatividade
        this.startInactivityMonitoring();

        // Atualiza periodicamente
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        const messageForm = document.getElementById('messageForm');
        const messageInput = document.getElementById('messageInput');
        const backToPublicBtn = document.getElementById('backToPublicBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const photoBtn = document.getElementById('photoBtn');
        const videoBtn = document.getElementById('videoBtn');
        const videoCallBtn = document.getElementById('videoCallBtn');
        const photoInput = document.getElementById('photoInput');
        const videoInput = document.getElementById('videoInput');
        const closeVideoCall = document.getElementById('closeVideoCall');
        const endCallBtn = document.getElementById('endCall');
        const toggleVideoBtn = document.getElementById('toggleVideo');
        const toggleAudioBtn = document.getElementById('toggleAudio');

        messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        // Permite enviar com Enter
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Botão voltar ao público
        backToPublicBtn.addEventListener('click', () => {
            this.switchToPublicChat();
        });

        // Botão de logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('Tem certeza que deseja sair? Todas as suas mensagens e atividades serão removidas.')) {
                    this.logout();
                }
            });
        }

        // Botão de editar perfil
        const editProfileBtn = document.getElementById('editProfileBtn');
        const editProfileModal = document.getElementById('editProfileModal');
        const closeEditProfile = document.getElementById('closeEditProfile');
        const cancelEditProfile = document.getElementById('cancelEditProfile');
        const editProfileForm = document.getElementById('editProfileForm');

        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', () => {
                this.openEditProfileModal();
            });
        }

        if (closeEditProfile) {
            closeEditProfile.addEventListener('click', () => {
                this.closeEditProfileModal();
            });
        }

        if (cancelEditProfile) {
            cancelEditProfile.addEventListener('click', () => {
                this.closeEditProfileModal();
            });
        }

        if (editProfileForm) {
            editProfileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProfileChanges();
            });
        }

        // Fecha modal ao clicar fora
        if (editProfileModal) {
            editProfileModal.addEventListener('click', (e) => {
                if (e.target === editProfileModal) {
                    this.closeEditProfileModal();
                }
            });
        }

        // Botões de mídia
        photoBtn.addEventListener('click', () => {
            photoInput.click();
        });

        videoBtn.addEventListener('click', () => {
            videoInput.click();
        });

        videoCallBtn.addEventListener('click', () => {
            this.startVideoCall();
        });

        // Upload de foto
        photoInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0], 'image');
        });

        // Upload de vídeo
        videoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.size > 50 * 1024 * 1024) { // 50MB limite
                alert('Vídeo muito grande! Máximo 50MB.');
                return;
            }
            this.handleFileUpload(file, 'video');
        });

        // Controles de vídeo chamada
        closeVideoCall.addEventListener('click', () => {
            this.endVideoCall();
        });

        endCallBtn.addEventListener('click', () => {
            this.endVideoCall();
        });

        toggleVideoBtn.addEventListener('click', () => {
            this.toggleVideo();
        });

        toggleAudioBtn.addEventListener('click', () => {
            this.toggleAudio();
        });

        // Auto-scroll quando novas mensagens chegam
        this.observeNewMessages();

        // Marca usuário como offline quando a página/janela for fechada
        this.setupBeforeUnload();

        // Marca usuário como offline quando a página/janela for fechada
        this.setupBeforeUnload();

        // Eventos para detectar atividade do usuário
        this.setupActivityDetection();
    }

    setupActivityDetection() {
        // Eventos que indicam atividade do usuário
        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        
        activityEvents.forEach(event => {
            document.addEventListener(event, () => {
                // Não aguarda para não bloquear o evento
                this.updateActivity().catch(err => {
                    console.warn('Erro ao atualizar atividade:', err);
                });
            }, { passive: true });
        });

        // Também detecta quando o usuário está digitando
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('input', () => {
                this.updateActivity().catch(err => {
                    console.warn('Erro ao atualizar atividade:', err);
                });
            });
        }
    }

    async updateActivity() {
        if (!this.currentUser || !this.currentUser.id) {
            return; // Usuário não está logado
        }

        this.lastActivityTime = Date.now();
        
        // Salva timestamp da última atividade no localStorage (fallback)
        try {
            localStorage.setItem('lastActivity_' + this.currentUser.id, this.lastActivityTime.toString());
        } catch (error) {
            console.warn('Erro ao salvar atividade no localStorage:', error);
        }

        // Atualiza no Supabase (não bloqueia se houver erro de rede)
        try {
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                // Não aguarda para não bloquear o fluxo em caso de erro de rede
                service.updateLastActivity(this.currentUser.id).catch(err => {
                    // Erro já é logado na função, apenas ignora aqui
                });
            }
        } catch (error) {
            // Erro não crítico - atividade já foi salva no localStorage
            console.warn('Erro ao atualizar atividade no Supabase (não crítico):', error);
        }

        this.resetInactivityTimer();
    }

    startInactivityMonitoring() {
        // Carrega última atividade salva
        const savedActivity = localStorage.getItem('lastActivity_' + this.currentUser.id);
        if (savedActivity) {
            this.lastActivityTime = parseInt(savedActivity);
        }

        // Verifica se já passou o timeout
        this.checkInactivity();
        
        // Inicia o timer
        this.resetInactivityTimer();
    }

    resetInactivityTimer() {
        // Limpa timer anterior
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
        }

        // Configura novo timer
        this.inactivityTimeout = setTimeout(() => {
            this.handleInactivity();
        }, this.INACTIVITY_TIMEOUT);
    }

    checkInactivity() {
        const timeSinceLastActivity = Date.now() - this.lastActivityTime;
        
        if (timeSinceLastActivity >= this.INACTIVITY_TIMEOUT) {
            // Já passou o tempo de inatividade
            this.handleInactivity();
        } else {
            // Ainda há tempo, configura timer para o restante
            const remainingTime = this.INACTIVITY_TIMEOUT - timeSinceLastActivity;
            this.inactivityTimeout = setTimeout(() => {
                this.handleInactivity();
            }, remainingTime);
        }
    }

    async handleInactivity() {
        // Salva o ID do usuário antes de limpar (precisa para marcar como offline)
        const userId = this.currentUser ? this.currentUser.id : null;
        
        // Marca o usuário como offline no Supabase ANTES de limpar os dados
        const service = window.supabaseService || supabaseService;
        if (service && service.isReady() && userId) {
            try {
                await service.setUserOffline(userId);
            } catch (error) {
                console.error('Erro ao marcar usuário como offline (timeout):', error);
            }
        }
        
        // Limpa dados do usuário
        await this.cleanupUserData();
        
        // Desconecta o usuário
        alert('Você foi desconectado por inatividade (30 minutos sem interação).');
        await this.logout();
    }

    async cleanupUserData() {
        if (!this.currentUser) return;

        const userId = this.currentUser.id;

        // Remove todas as mensagens do usuário (públicas e privadas)
        // Isso também remove automaticamente todas as mídias (fotos e vídeos) associadas
        const messagesBefore = this.messages.length;
        this.messages = this.messages.filter(message => {
            // Remove mensagens enviadas pelo usuário (incluindo mídias)
            if (message.userId === userId) {
                return false;
            }
            // Remove mensagens privadas recebidas pelo usuário (se for o destinatário)
            if (message.type === 'private' && message.recipientId === userId) {
                return false;
            }
            return true;
        });

        // Salva mensagens atualizadas (sem as mensagens e mídias do usuário)
        localStorage.setItem('chatMessages', JSON.stringify(this.messages));

        // Remove dados de atividade do usuário
        localStorage.removeItem('lastActivity_' + userId);

        // Remove mensagens e mídias do Supabase
        try {
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                await service.deleteUserMessages(userId);
                await service.deleteUserMedia(userId);
            }
        } catch (error) {
            console.error('Erro ao limpar dados no Supabase:', error);
        }

        // Log para debug (pode ser removido em produção)
        console.log(`Dados limpos: ${messagesBefore - this.messages.length} mensagens removidas do usuário ${userId}`);
    }

    async logout() {
        try {
            // Salva o ID do usuário antes de limpar (precisa para marcar como offline)
            const userId = this.currentUser ? this.currentUser.id : null;
            
            // Marca o usuário como offline no Supabase ANTES de limpar os dados
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady() && userId) {
                try {
                    await service.setUserOffline(userId);
                } catch (error) {
                    console.error('Erro ao marcar usuário como offline:', error);
                }
            }
            
            // Limpa dados do usuário antes de fazer logout
            await this.cleanupUserData();
            
            // Limpa timer de inatividade
            if (this.inactivityTimeout) {
                clearTimeout(this.inactivityTimeout);
            }

            // Faz logout no Supabase para limpar a sessão
            if (service && service.isReady()) {
                try {
                    await service.signOut();
                } catch (error) {
                    console.error('Erro ao fazer logout no Supabase:', error);
                }
            }

            // Limpa todos os dados de atividade (antes de limpar currentUser)
            if (userId) {
                localStorage.removeItem('lastActivity_' + userId);
            }

            // Remove usuário atual de todos os lugares
            this.currentUser = null;
            sessionStorage.removeItem('currentUser');
            sessionStorage.setItem('justLoggedOut', 'true'); // Flag para evitar login automático
            localStorage.removeItem('currentUser');
            
            // Aguarda um pouco para garantir que tudo foi limpo
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Redireciona para login
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            // Mesmo com erro, tenta limpar e redirecionar
            const userId = this.currentUser ? this.currentUser.id : null;
            
            // Tenta marcar como offline mesmo em caso de erro
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady() && userId) {
                try {
                    await service.setUserOffline(userId);
                } catch (err) {
                    console.error('Erro ao marcar usuário como offline (fallback):', err);
                }
            }
            
            this.currentUser = null;
            sessionStorage.setItem('justLoggedOut', 'true');
            sessionStorage.removeItem('currentUser');
            localStorage.removeItem('currentUser');
            if (userId) {
                localStorage.removeItem('lastActivity_' + userId);
            }
            window.location.href = 'index.html';
        }
    }

    sendMessage(content = null, mediaType = null, mediaData = null) {
        const messageInput = document.getElementById('messageInput');
        const textContent = content || messageInput.value.trim();

        // Se não há conteúdo de texto nem mídia, não envia
        if (!textContent && !mediaData) return;

        // Atualiza atividade ao enviar mensagem
        this.updateActivity().catch(err => {
            console.warn('Erro ao atualizar atividade:', err);
        });

        const message = {
            id: Date.now().toString(),
            userId: this.currentUser.id,
            nickname: this.currentUser.nickname,
            city: this.currentUser.city,
            content: textContent || '',
            timestamp: new Date().toISOString(),
            type: this.chatMode, // 'public' ou 'private'
            recipientId: this.chatMode === 'private' ? this.privateChatWith : null,
            mediaType: mediaType, // 'image' ou 'video'
            mediaData: mediaData // Base64 ou URL
        };

        this.messages.push(message);
        localStorage.setItem('chatMessages', JSON.stringify(this.messages));

        this.displayMessage(message);
        if (!content) {
            messageInput.value = '';
            messageInput.focus();
        }

        // Limita o número de mensagens armazenadas (últimas 500)
        if (this.messages.length > 500) {
            this.messages = this.messages.slice(-500);
            localStorage.setItem('chatMessages', JSON.stringify(this.messages));
        }
    }

    handleFileUpload(file, mediaType) {
        if (!file) return;

        // Validação de tamanho
        if (mediaType === 'image' && file.size > 5 * 1024 * 1024) {
            alert('Imagem muito grande! Máximo 5MB.');
            document.getElementById(mediaType === 'image' ? 'photoInput' : 'videoInput').value = '';
            return;
        }
        
        if (mediaType === 'video' && file.size > 10 * 1024 * 1024) {
            alert('Vídeo muito grande! Máximo 10MB.');
            document.getElementById('videoInput').value = '';
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            const mediaData = e.target.result;
            this.sendMessage('', mediaType, mediaData);
            // Limpa o input após o upload
            document.getElementById(mediaType === 'image' ? 'photoInput' : 'videoInput').value = '';
        };

        reader.onerror = () => {
            alert('Erro ao carregar arquivo. Tente novamente.');
            document.getElementById(mediaType === 'image' ? 'photoInput' : 'videoInput').value = '';
        };

        if (mediaType === 'image') {
            reader.readAsDataURL(file);
        } else if (mediaType === 'video') {
            reader.readAsDataURL(file);
        }
    }

    async loadMessages() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        chatMessages.innerHTML = '';

        // Carrega usuários bloqueados antes de filtrar mensagens
        await this.loadBlockedUsers();

        try {
            const service = window.supabaseService || supabaseService;
            let messages = [];

            if (service && service.isReady()) {
                // Busca mensagens do Supabase
                if (this.chatMode === 'public') {
                    messages = await service.getPublicMessages(100);
                } else if (this.chatMode === 'private' && this.privateChatWith) {
                    // Verifica se o usuário está bloqueado
                    const isBlocked = this.blockedUsers.includes(this.privateChatWith);
                    if (isBlocked) {
                        this.showEmptyState();
                        return;
                    }
                    messages = await service.getPrivateMessages(this.currentUser.id, this.privateChatWith, 100);
                }
            } else {
                // Fallback para localStorage se Supabase não estiver pronto
                messages = JSON.parse(localStorage.getItem('chatMessages')) || [];
            }

            // Inverte para ordem cronológica (mais antigas primeiro)
            messages = messages.reverse();

            // Filtra mensagens de usuários bloqueados
            let filteredMessages = messages.filter(message => {
                // Filtra mensagens de usuários bloqueados
                if (this.blockedUsers.includes(message.userId)) {
                    return false;
                }

                // Filtra por tipo de chat
                if (this.chatMode === 'public') {
                    return message.type === 'public';
                } else if (this.chatMode === 'private') {
                    if (message.type !== 'private') return false;
                    const isFromMe = message.userId === this.currentUser.id;
                    const isToMe = message.recipientId === this.currentUser.id;
                    const isFromThem = message.userId === this.privateChatWith;
                    const isToThem = message.recipientId === this.privateChatWith;
                    return (isFromMe && isToThem) || (isFromThem && isToMe);
                }
                return true;
            });

            // Atualiza this.messages para compatibilidade
            this.messages = messages;

            if (filteredMessages.length === 0) {
                this.showEmptyState();
                return;
            }

            filteredMessages.forEach(message => {
                this.displayMessage(message);
            });

            this.scrollToBottom();
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            // Em caso de erro, tenta usar localStorage como fallback
            const fallbackMessages = JSON.parse(localStorage.getItem('chatMessages')) || [];
            if (fallbackMessages.length > 0) {
                this.messages = fallbackMessages;
                fallbackMessages.forEach(message => {
                    this.displayMessage(message);
                });
                this.scrollToBottom();
            } else {
                this.showEmptyState();
            }
        }
    }

    async showEmptyState() {
        const chatMessages = document.getElementById('chatMessages');
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        
        let message = '';
        if (this.chatMode === 'public') {
            message = `
                <div class="empty-state-content">
                    <p>📭 Nenhuma mensagem ainda</p>
                    <p class="empty-state-subtitle">Seja o primeiro a enviar uma mensagem pública!</p>
                </div>
            `;
        } else {
            // Verifica se o usuário está bloqueado
            const isBlocked = this.blockedUsers.includes(this.privateChatWith);
            if (isBlocked) {
                message = `
                    <div class="empty-state-content">
                        <p>🚫 Usuário Bloqueado</p>
                        <p class="empty-state-subtitle">Você bloqueou este usuário. Desbloqueie para conversar.</p>
                    </div>
                `;
            } else {
                const privateUser = await this.getUserById(this.privateChatWith);
                const userName = privateUser ? (privateUser.nickname || privateUser.profile?.nickname) : 'este usuário';
                message = `
                    <div class="empty-state-content">
                        <p>💬 Conversa privada</p>
                        <p class="empty-state-subtitle">Você está conversando privadamente com ${this.escapeHtml(userName)}</p>
                    </div>
                `;
            }
        }
        
        emptyDiv.innerHTML = message;
        chatMessages.appendChild(emptyDiv);
    }

    displayMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        
        // Remove mensagem de estado vazio se existir
        const emptyState = chatMessages.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        if (message.userId === this.currentUser.id) {
            messageDiv.classList.add('own-message');
        }

        if (message.type === 'private') {
            messageDiv.classList.add('private-message');
        }

        const time = new Date(message.timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const privateBadge = (message.type === 'private') ? '<span class="private-badge">🔒 Privado</span>' : '';

        // Conteúdo de mídia
        let mediaContent = '';
        if (message.mediaType === 'image' && message.mediaData) {
            mediaContent = `<div class="message-media"><img src="${message.mediaData}" alt="Imagem enviada" class="message-image"></div>`;
        } else if (message.mediaType === 'video' && message.mediaData) {
            mediaContent = `<div class="message-media"><video controls class="message-video"><source src="${message.mediaData}" type="video/mp4">Seu navegador não suporta vídeo.</video></div>`;
        }

        const textContent = message.content ? `<div class="message-content">${this.escapeHtml(message.content)}</div>` : '';

        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-nickname">${this.escapeHtml(message.nickname)}</span>
                <span class="message-city">${this.escapeHtml(message.city)}</span>
                ${privateBadge}
                <span class="message-time">${time}</span>
            </div>
            ${mediaContent}
            ${textContent}
        `;

        chatMessages.appendChild(messageDiv);
        
        // Adiciona evento de clique para ampliar imagens
        if (message.mediaType === 'image') {
            const img = messageDiv.querySelector('.message-image');
            if (img) {
                img.addEventListener('click', () => {
                    this.showImageModal(message.mediaData);
                });
            }
        }
        
        this.scrollToBottom();
    }

    showImageModal(imageSrc) {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            cursor: pointer;
        `;
        
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        `;
        
        modal.appendChild(img);
        document.body.appendChild(modal);
        
        modal.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    startVideoCall() {
        // Atualiza atividade ao iniciar vídeo chamada
        this.updateActivity().catch(err => {
            console.warn('Erro ao atualizar atividade:', err);
        });
        
        const modal = document.getElementById('videoCallModal');
        const status = document.getElementById('videoCallStatus');
        modal.style.display = 'flex';
        
        // Solicita acesso à câmera e microfone
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                const localVideo = document.getElementById('localVideo');
                localVideo.srcObject = stream;
                status.textContent = 'Chamada iniciada - Aguardando resposta...';
                
                // Simula conexão (em produção, usaria WebRTC)
                setTimeout(() => {
                    status.textContent = 'Conectado';
                    status.style.color = '#4caf50';
                }, 2000);
            })
            .catch(err => {
                console.error('Erro ao acessar mídia:', err);
                status.textContent = 'Erro ao acessar câmera/microfone';
                status.style.color = '#f44336';
            });
    }

    endVideoCall() {
        const modal = document.getElementById('videoCallModal');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
        // Para os streams
        if (localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
        }
        
        modal.style.display = 'none';
        
        // Envia notificação de chamada encerrada
        if (this.chatMode === 'private') {
            this.sendMessage('📞 Chamada de vídeo encerrada', null, null);
        }
    }

    toggleVideo() {
        const localVideo = document.getElementById('localVideo');
        if (localVideo.srcObject) {
            const videoTrack = localVideo.srcObject.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = document.getElementById('toggleVideo');
                btn.textContent = videoTrack.enabled ? '📹' : '📹🚫';
            }
        }
    }

    toggleAudio() {
        const localVideo = document.getElementById('localVideo');
        if (localVideo.srcObject) {
            const audioTrack = localVideo.srcObject.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.getElementById('toggleAudio');
                btn.textContent = audioTrack.enabled ? '🎤' : '🎤🚫';
            }
        }
    }

    async loadBlockedUsers() {
        try {
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                const blocked = await service.getBlockedUsers();
                this.blockedUsers = blocked.map(b => b.id);
            }
        } catch (error) {
            console.error('Erro ao carregar usuários bloqueados:', error);
        }
    }

    async loadOnlineUsers(forceUpdate = false) {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;

        try {
            const service = window.supabaseService || supabaseService;
            let allUsers = [];

            if (service && service.isReady()) {
                try {
                    // Busca usuários online do Supabase
                    allUsers = await service.getOnlineUsers();
                } catch (fetchError) {
                    console.warn('Erro ao buscar usuários do Supabase, usando fallback:', fetchError);
                    // Fallback para localStorage em caso de erro
                    allUsers = JSON.parse(localStorage.getItem('chatUsers')) || [];
                }
            } else {
                // Fallback para localStorage
                allUsers = JSON.parse(localStorage.getItem('chatUsers')) || [];
            }

            // Filtra apenas outros usuários (não o atual)
            // IMPORTANTE: NÃO filtra usuários bloqueados para que possam ser desbloqueados
            const otherUsers = allUsers.filter(user => 
                user.id !== this.currentUser.id
            );

            // Conta apenas usuários não bloqueados para o badge
            const nonBlockedUsers = otherUsers.filter(user => 
                !this.blockedUsers.includes(user.id)
            );

            // Cria uma chave simples para comparar (apenas IDs ordenados)
            const currentUsersKey = JSON.stringify(otherUsers.map(u => u.id).sort());
            const lastUsersKey = this.lastUsersList ? JSON.stringify(this.lastUsersList.map(u => u.id).sort()) : null;

            // Se não houve mudanças e não é uma atualização forçada, não recria a lista
            if (!forceUpdate && currentUsersKey === lastUsersKey && usersList.children.length > 0) {
                // Apenas atualiza o contador se necessário (conta apenas não bloqueados)
                const currentCount = nonBlockedUsers.length;
                const badgeCount = parseInt(document.getElementById('onlineCountBadge').textContent) || 0;
                if (currentCount !== badgeCount) {
                    document.getElementById('onlineCountBadge').textContent = currentCount.toString();
                }
                return; // Não recria a lista se não houve mudanças
            }

            // Limpa a lista apenas se necessário
            usersList.innerHTML = '';

            if (otherUsers.length === 0) {
                usersList.innerHTML = '<div class="no-users">Nenhum outro usuário online</div>';
                document.getElementById('onlineCountBadge').textContent = '0';
                return;
            }

            // Adiciona botão para chat público
            const publicChatBtn = document.createElement('div');
            publicChatBtn.className = `user-item ${this.chatMode === 'public' ? 'active' : ''}`;
            publicChatBtn.innerHTML = `
                <div class="user-avatar">🌐</div>
                <div class="user-details">
                    <div class="user-name">Chat Público</div>
                    <div class="user-status">Todos podem ver</div>
                </div>
            `;
            publicChatBtn.addEventListener('click', () => {
                this.switchToPublicChat();
            });
            usersList.appendChild(publicChatBtn);

            // Adiciona outros usuários
            for (const user of otherUsers) {
                const userItem = document.createElement('div');
                const isActive = this.chatMode === 'private' && this.privateChatWith === user.id;
                const isBlocked = this.blockedUsers.includes(user.id);
                userItem.className = `user-item ${isActive ? 'active' : ''} ${isBlocked ? 'blocked' : ''}`;
                
                // Verifica se está bloqueado
                const isUserBlocked = await this.checkIfUserBlocked(user.id);
                
                userItem.innerHTML = `
                    <div class="user-avatar">👤</div>
                    <div class="user-details">
                        <div class="user-name">${this.escapeHtml(user.nickname || user.profile?.nickname || 'Usuário')}</div>
                        <div class="user-status">${this.escapeHtml(user.city || user.profile?.city || '')}</div>
                    </div>
                    <div class="user-actions">
                        <button class="block-btn ${isUserBlocked ? 'blocked' : ''}" 
                                data-user-id="${user.id}" 
                                data-action="${isUserBlocked ? 'unblock' : 'block'}"
                                title="${isUserBlocked ? 'Desbloquear' : 'Bloquear'}">
                            ${isUserBlocked ? '🔓' : '🚫'}
                        </button>
                    </div>
                `;
                
                // Evento de clique no usuário
                userItem.querySelector('.user-details').addEventListener('click', () => {
                    if (!isUserBlocked) {
                        this.switchToPrivateChat(user.id);
                    } else {
                        // Se estiver bloqueado, mostra mensagem ao clicar
                        alert('Este usuário está bloqueado. Clique no botão 🔓 para desbloquear e conversar.');
                    }
                });

                // Evento de bloqueio/desbloqueio
                const blockBtn = userItem.querySelector('.block-btn');
                blockBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const userId = blockBtn.dataset.userId;
                    const action = blockBtn.dataset.action;
                    
                    if (action === 'block') {
                        await this.blockUser(userId);
                    } else {
                        await this.unblockUser(userId);
                    }
                });

                usersList.appendChild(userItem);
            }

            // Atualiza contador com apenas usuários não bloqueados
            document.getElementById('onlineCountBadge').textContent = nonBlockedUsers.length;

            // Armazena o estado atual para próxima comparação (após renderizar)
            this.lastUsersList = otherUsers.map(u => ({ id: u.id }));
        } catch (error) {
            console.error('Erro ao carregar usuários online:', error);
            usersList.innerHTML = '<div class="no-users">Erro ao carregar usuários</div>';
        }
    }

    async checkIfUserBlocked(userId) {
        try {
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                return await service.isUserBlocked(userId);
            }
            return this.blockedUsers.includes(userId);
        } catch (error) {
            return this.blockedUsers.includes(userId);
        }
    }

    async blockUser(userId) {
        try {
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                await service.blockUser(userId);
                this.blockedUsers.push(userId);
                
                // Se estava conversando com esse usuário, volta ao público
                if (this.privateChatWith === userId) {
                    this.switchToPublicChat();
                }
                
                // Recarrega a lista de usuários
                await this.loadOnlineUsers(true); // Força atualização após bloquear
                await this.loadMessages();
                
                alert('Usuário bloqueado com sucesso!');
            } else {
                alert('Sistema ainda não está pronto. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao bloquear usuário:', error);
            alert('Erro ao bloquear usuário. Tente novamente.');
        }
    }

    async unblockUser(userId) {
        try {
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                await service.unblockUser(userId);
                this.blockedUsers = this.blockedUsers.filter(id => id !== userId);
                
                // Recarrega a lista de usuários
                await this.loadOnlineUsers(true); // Força atualização após desbloquear
                
                alert('Usuário desbloqueado com sucesso!');
            } else {
                alert('Sistema ainda não está pronto. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao desbloquear usuário:', error);
            alert('Erro ao desbloquear usuário. Tente novamente.');
        }
    }

    async switchToPublicChat() {
        this.chatMode = 'public';
        this.privateChatWith = null;
        document.getElementById('chatModeText').textContent = 'Chat Público';
        document.getElementById('backToPublicBtn').style.display = 'none';
        document.getElementById('mediaActions').style.display = 'none';
        // Atualiza atividade ao mudar de chat
        this.updateActivity().catch(err => {
            console.warn('Erro ao atualizar atividade:', err);
        });
        await this.loadMessages();
        await this.loadOnlineUsers(true); // Força atualização ao mudar de modo
        document.getElementById('messageInput').placeholder = 'Digite sua mensagem pública...';
    }

    async switchToPrivateChat(userId) {
        // Verifica se o usuário está bloqueado
        const isBlocked = await this.checkIfUserBlocked(userId);
        if (isBlocked) {
            alert('Você bloqueou este usuário. Desbloqueie para conversar.');
            return;
        }

        this.chatMode = 'private';
        this.privateChatWith = userId;
        const user = await this.getUserById(userId);
        const userName = user ? (user.nickname || user.profile?.nickname) : 'Usuário';
        document.getElementById('chatModeText').textContent = `Chat Privado com ${this.escapeHtml(userName)}`;
        document.getElementById('backToPublicBtn').style.display = 'inline-block';
        document.getElementById('mediaActions').style.display = 'flex';
        // Atualiza atividade ao mudar de chat
        this.updateActivity().catch(err => {
            console.warn('Erro ao atualizar atividade:', err);
        });
        await this.loadMessages();
        await this.loadOnlineUsers(true); // Força atualização ao mudar de modo
        document.getElementById('messageInput').placeholder = `Mensagem privada para ${this.escapeHtml(userName)}...`;
    }

    async getUserById(userId) {
        try {
            const service = window.supabaseService || supabaseService;
            if (service && service.isReady()) {
                // Busca do Supabase (seria necessário uma função no service)
                // Por enquanto, usa fallback
            }
        } catch (error) {
            console.error('Erro ao buscar usuário:', error);
        }
        
        // Fallback para localStorage
        const allUsers = JSON.parse(localStorage.getItem('chatUsers')) || [];
        return allUsers.find(user => user.id === userId);
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    observeNewMessages() {
        // Observa mudanças no localStorage de outros usuários (simulação)
        window.addEventListener('storage', (e) => {
            if (e.key === 'chatMessages') {
                this.messages = JSON.parse(e.newValue) || [];
                this.loadMessages();
            }
            if (e.key === 'chatUsers') {
                this.loadOnlineUsers(true); // Força atualização quando há mudança no storage
            }
        });
    }

    setupBeforeUnload() {
        // Marca o usuário como offline quando a página/janela for fechada
        window.addEventListener('beforeunload', () => {
            const userId = this.currentUser ? this.currentUser.id : null;
            if (userId) {
                const service = window.supabaseService || supabaseService;
                if (service && service.isReady()) {
                    // Não aguarda para não bloquear o fechamento da página
                    // O erro já é tratado dentro da função setUserOffline
                    service.setUserOffline(userId).catch(() => {
                        // Erro já é logado na função, apenas ignora aqui
                    });
                }
            }
        });
    }

    startPeriodicUpdates() {
        // Atualiza mensagens periodicamente (mais frequente)
        setInterval(() => {
            const storedMessages = JSON.parse(localStorage.getItem('chatMessages')) || [];
            if (JSON.stringify(storedMessages) !== JSON.stringify(this.messages)) {
                this.messages = storedMessages;
                this.loadMessages();
            }
        }, 1000);

        // Atualiza lista de usuários com menos frequência (5 segundos)
        setInterval(() => {
            this.loadOnlineUsers(false); // false = não força atualização, só atualiza se houver mudanças
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    openEditProfileModal() {
        const modal = document.getElementById('editProfileModal');
        const editProfileForm = document.getElementById('editProfileForm');
        const nicknameInput = document.getElementById('editNickname');
        const emailInput = document.getElementById('editEmail');
        const citySelect = document.getElementById('editCity');
        const errorDiv = document.getElementById('editProfileError');
        const submitBtn = editProfileForm ? editProfileForm.querySelector('button[type="submit"]') : null;

        if (!modal || !this.currentUser) return;

        // Preenche os campos com os dados atuais
        nicknameInput.value = this.currentUser.nickname || '';
        emailInput.value = this.currentUser.email || '';
        citySelect.value = this.currentUser.city || '';

        // Limpa erros anteriores
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.classList.remove('show');
        }

        // Garante que o botão está no estado correto (habilitado e com texto original)
        if (submitBtn) {
            submitBtn.disabled = false;
            // Restaura o texto original do botão
            const originalText = submitBtn.getAttribute('data-original-text') || submitBtn.textContent || 'Salvar Alterações';
            submitBtn.textContent = originalText;
            // Se não tinha o atributo, define agora
            if (!submitBtn.getAttribute('data-original-text')) {
                submitBtn.setAttribute('data-original-text', originalText);
            }
        }

        modal.style.display = 'flex';
    }

    closeEditProfileModal() {
        const modal = document.getElementById('editProfileModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async saveProfileChanges() {
        const editProfileForm = document.getElementById('editProfileForm');
        const nicknameInput = document.getElementById('editNickname');
        const emailInput = document.getElementById('editEmail');
        const citySelect = document.getElementById('editCity');
        const errorDiv = document.getElementById('editProfileError');
        const submitBtn = editProfileForm ? editProfileForm.querySelector('button[type="submit"]') : null;

        if (!nicknameInput || !emailInput || !citySelect || !submitBtn) return;

        const nickname = nicknameInput.value.trim();
        const email = emailInput.value.trim();
        const city = citySelect.value.trim();

        // Validações
        if (!nickname || !email || !city) {
            this.showEditError('Por favor, preencha todos os campos!', errorDiv);
            return;
        }

        // Mostra loading
        const originalText = submitBtn.textContent || 'Salvar Alterações';
        // Armazena o texto original como atributo para recuperar depois
        if (!submitBtn.getAttribute('data-original-text')) {
            submitBtn.setAttribute('data-original-text', originalText);
        }
        submitBtn.textContent = 'Salvando...';
        submitBtn.disabled = true;

        try {
            const service = window.supabaseService || supabaseService;
            if (!service || !service.isReady()) {
                throw new Error('Sistema ainda não está pronto. Tente novamente.');
            }

            // Atualiza o perfil no Supabase
            const updatedProfile = await service.updateProfile(this.currentUser.id, {
                nickname,
                email,
                city
            });

            if (updatedProfile) {
                // Atualiza o usuário atual
                this.currentUser.nickname = updatedProfile.nickname;
                this.currentUser.email = updatedProfile.email;
                this.currentUser.city = updatedProfile.city;

                // Atualiza no sessionStorage
                sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));

                // Atualiza a interface
                document.getElementById('currentUserNickname').textContent = updatedProfile.nickname;
                document.getElementById('currentUserCity').textContent = updatedProfile.city;

                // Reabilita o botão antes de fechar o modal
                const savedOriginalText = submitBtn.getAttribute('data-original-text') || originalText;
                submitBtn.textContent = savedOriginalText;
                submitBtn.disabled = false;

                // Fecha o modal
                this.closeEditProfileModal();

                // Mostra mensagem de sucesso
                alert('Perfil atualizado com sucesso!');
            } else {
                // Se não retornou perfil, reabilita o botão
                const savedOriginalText = submitBtn.getAttribute('data-original-text') || originalText;
                submitBtn.textContent = savedOriginalText;
                submitBtn.disabled = false;
                throw new Error('Não foi possível atualizar o perfil. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao atualizar perfil:', error);
            
            let errorMessage = 'Erro ao atualizar perfil. Tente novamente.';
            if (error.message) {
                // Verifica se é erro de apelido duplicado
                if (error.message.includes('apelido') && error.message.includes('uso')) {
                    errorMessage = error.message;
                } else if (error.message.includes('email') && error.message.includes('already')) {
                    errorMessage = 'Este e-mail já está em uso por outro usuário!';
                } else if (error.message.includes('unique') || error.message.includes('duplicate')) {
                    // Erro genérico de constraint unique
                    if (error.message.toLowerCase().includes('nickname')) {
                        errorMessage = 'Este apelido já está em uso. Por favor, escolha outro apelido.';
                    } else {
                        errorMessage = error.message;
                    }
                } else {
                    errorMessage = error.message;
                }
            }

            this.showEditError(errorMessage, errorDiv);
            const savedOriginalText = submitBtn.getAttribute('data-original-text') || originalText;
            submitBtn.textContent = savedOriginalText;
            submitBtn.disabled = false;
        }
    }

    showEditError(message, errorDiv) {
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.add('show');
            setTimeout(() => {
                errorDiv.classList.remove('show');
            }, 5000);
        }
    }
}

// Inicializa o chat quando a página carregar
if (window.location.pathname.includes('chat.html')) {
    const chatManager = new ChatManager();
}
