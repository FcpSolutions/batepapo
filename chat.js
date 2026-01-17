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
        this.lastMessagesList = null; // Armazena o estado anterior das mensagens para evitar re-renderizações desnecessárias
        this.isLoadingMessages = false; // Flag para evitar atualizações simultâneas
        this.updateActivityDebounceTimer = null; // Timer para debounce de updateActivity
        this.lastActivityUpdate = 0; // Timestamp da última atualização de atividade
        this.messageChannel = null; // Canal Realtime para mensagens
        this.profileChannel = null; // Canal Realtime para perfis
        this.videoCallInviteChannel = null; // Canal Realtime para convites de vídeo chamada
        this.currentVideoCallInviteId = null; // ID do convite atual (quando está chamando)
        this.currentIncomingVideoCallInviteId = null; // ID do convite recebido (quando está sendo chamado)
        this.currentVideoStream = null; // Stream de vídeo atual
        this.peerConnection = null; // Conexão WebRTC
        this.webrtcSignalChannel = null; // Canal Realtime para sinais WebRTC
        this.isCaller = false; // Indica se é quem iniciou a chamada
        this.activeWebRTCInviteId = null; // ID do convite ativo para WebRTC (garantir que não seja null)
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
        this.loadMessages(true); // Força atualização inicial

        // Carrega lista de usuários bloqueados
        this.loadBlockedUsers();

        // Carrega lista de usuários online
        this.loadOnlineUsers(true); // Força atualização inicial

        // Configura eventos
        this.setupEventListeners();

        // Inicia monitoramento de inatividade
        this.startInactivityMonitoring();

        // Inicia Realtime (atualizações em tempo real)
        this.initRealtime();
        
        // Inicia escuta de convites de vídeo chamada
        this.initVideoCallInvites();
        
        // Atualiza periodicamente apenas como fallback (muito menos frequente)
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
        const acceptCallBtn = document.getElementById('acceptCallBtn');
        const rejectCallBtn = document.getElementById('rejectCallBtn');

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

        // Botões de aceitar/recusar vídeo chamada
        // (acceptCallBtn e rejectCallBtn já foram declarados no início da função)
        if (acceptCallBtn) {
            acceptCallBtn.addEventListener('click', () => {
                this.acceptVideoCall();
            });
        }

        if (rejectCallBtn) {
            rejectCallBtn.addEventListener('click', () => {
                this.rejectVideoCall();
            });
        }

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

        // Eventos para detectar atividade do usuário
        this.setupActivityDetection();

        // Controles mobile - menu sidebar
        this.setupMobileMenu();
    }

    setupMobileMenu() {
        const menuToggleBtn = document.getElementById('menuToggleBtn');
        const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
        const sidebar = document.getElementById('usersSidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (menuToggleBtn) {
            menuToggleBtn.addEventListener('click', () => {
                if (sidebar) {
                    sidebar.classList.add('open');
                }
                if (overlay) {
                    overlay.classList.add('active');
                }
            });
        }

        if (sidebarCloseBtn) {
            sidebarCloseBtn.addEventListener('click', () => {
                this.closeSidebar();
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => {
                this.closeSidebar();
            });
        }

        // Fecha sidebar ao selecionar usuário no mobile
        const usersList = document.getElementById('usersList');
        if (usersList) {
            usersList.addEventListener('click', (e) => {
                // Se clicou em um user-item (não em botões de ação)
                if (e.target.closest('.user-item') && !e.target.closest('.user-actions')) {
                    // Verifica se está no mobile
                    if (window.innerWidth <= 768) {
                        setTimeout(() => {
                            this.closeSidebar();
                        }, 300); // Pequeno delay para melhor UX
                    }
                }
            });
        }
    }

    closeSidebar() {
        const sidebar = document.getElementById('usersSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (sidebar) {
            sidebar.classList.remove('open');
        }
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    setupActivityDetection() {
        // OTIMIZAÇÃO: Usa debounce para evitar atualizações excessivas
        // Atualiza no máximo a cada 5 segundos, mesmo com muitos eventos
        const activityEvents = ['mousedown', 'keypress', 'touchstart', 'click'];
        
        activityEvents.forEach(event => {
            document.addEventListener(event, () => {
                this.updateActivityDebounced();
            }, { passive: true });
        });

        // Eventos menos críticos (mousemove, scroll) não atualizam atividade
        // Apenas eventos de interação real (clique, tecla, toque)

        // Também detecta quando o usuário está digitando
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('input', () => {
                this.updateActivityDebounced();
            });
        }
    }

    updateActivityDebounced() {
        // Debounce: atualiza no máximo a cada 5 segundos
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastActivityUpdate;
        
        if (timeSinceLastUpdate < 5000) {
            // Se atualizou há menos de 5 segundos, apenas atualiza o timestamp local
            this.lastActivityTime = now;
            this.resetInactivityTimer();
            return;
        }

        // Limpa timer anterior
        if (this.updateActivityDebounceTimer) {
            clearTimeout(this.updateActivityDebounceTimer);
        }

        // Agenda atualização após 1 segundo (debounce)
        this.updateActivityDebounceTimer = setTimeout(() => {
            this.updateActivity().catch(err => {
                console.warn('Erro ao atualizar atividade:', err);
            });
            this.lastActivityUpdate = Date.now();
        }, 1000);
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
            const service = window.supabaseService;
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

        // Remove TODOS os dados do usuário no Supabase
        try {
            const service = window.supabaseService;
            if (service && service.isReady()) {
                console.log('🧹 Iniciando limpeza completa de dados do usuário...');
                
                // Remove mensagens (públicas e privadas)
                await service.deleteUserMessages(userId);
                console.log('✅ Mensagens deletadas');
                
                // Remove mídias (fotos e vídeos)
                await service.deleteUserMedia(userId);
                console.log('✅ Mídias deletadas');
                
                // Remove convites de vídeo chamada
                await service.deleteUserVideoCallInvites(userId);
                console.log('✅ Convites de vídeo chamada deletados');
                
                // Remove sinais WebRTC
                await service.deleteUserWebRTCSignals(userId);
                console.log('✅ Sinais WebRTC deletados');
                
                // Remove bloqueios
                await service.deleteUserBlocks(userId);
                console.log('✅ Bloqueios deletados');
                
                console.log('✅ Limpeza completa concluída');
            }
        } catch (error) {
            console.error('Erro ao limpar dados no Supabase:', error);
            // Continua mesmo se houver erro para garantir que o logout aconteça
        }

        // Log para debug (pode ser removido em produção)
        console.log(`Dados limpos: ${messagesBefore - this.messages.length} mensagens removidas do usuário ${userId}`);
    }

    async logout() {
        try {
            // Salva o ID do usuário antes de limpar (precisa para marcar como offline)
            const userId = this.currentUser ? this.currentUser.id : null;
            
            // Marca o usuário como offline no Supabase ANTES de limpar os dados
            const service = window.supabaseService;
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

            // Desinscreve-se dos canais Realtime
            this.cleanupRealtime();

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
            const service = window.supabaseService;
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

    async sendMessage(content = null, mediaType = null, mediaData = null) {
        const messageInput = document.getElementById('messageInput');
        const textContent = content || messageInput.value.trim();

        // Se não há conteúdo de texto nem mídia, não envia
        if (!textContent && !mediaData) return;

        // Atualiza atividade ao enviar mensagem
        this.updateActivity().catch(err => {
            console.warn('Erro ao atualizar atividade:', err);
        });

        try {
            const service = window.supabaseService;
            let mediaUrl = null;

            // Se houver mídia, faz upload primeiro
            if (mediaData && mediaType) {
                try {
                    // Converte base64 para File se necessário
                    const file = await this.base64ToFile(mediaData, mediaType);
                    const messageId = Date.now().toString();
                    mediaUrl = await service.uploadMedia(file, this.currentUser.id, messageId);
                } catch (mediaError) {
                    console.error('Erro ao fazer upload de mídia:', mediaError);
                    alert('Erro ao enviar mídia. Tente novamente.');
                    return;
                }
            }

            // Prepara os dados da mensagem para o Supabase
            const messageData = {
                user_id: this.currentUser.id,
                recipient_id: this.chatMode === 'private' ? this.privateChatWith : null,
                content: textContent || null,
                type: this.chatMode,
                media_type: mediaType || null,
                media_url: mediaUrl || null
            };

            // Envia mensagem para o Supabase
            if (service && service.isReady()) {
                const savedMessage = await service.sendMessage(messageData);
                
                // Adiciona à lista local para exibição imediata
                this.messages.push(savedMessage);
                
                // Exibe a mensagem na interface
                this.displayMessage(savedMessage);
            } else {
                // Fallback para localStorage se Supabase não estiver pronto
                const message = {
                    id: Date.now().toString(),
                    userId: this.currentUser.id,
                    nickname: this.currentUser.nickname,
                    city: this.currentUser.city,
                    content: textContent || '',
                    timestamp: new Date().toISOString(),
                    type: this.chatMode,
                    recipientId: this.chatMode === 'private' ? this.privateChatWith : null,
                    mediaType: mediaType,
                    mediaData: mediaData
                };

                this.messages.push(message);
                localStorage.setItem('chatMessages', JSON.stringify(this.messages));
                this.displayMessage(message);
            }

            // Limpa o input se não foi passado conteúdo
            if (!content) {
                messageInput.value = '';
                messageInput.focus();
            }

            // Limita o número de mensagens armazenadas localmente (últimas 500)
            if (this.messages.length > 500) {
                this.messages = this.messages.slice(-500);
                localStorage.setItem('chatMessages', JSON.stringify(this.messages));
            }
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            alert('Erro ao enviar mensagem. Tente novamente.');
        }
    }

    async base64ToFile(base64, mediaType) {
        // Converte base64 para File
        // Remove o prefixo data:image/...;base64, se existir
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        
        // Converte base64 para blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
            type: mediaType === 'image' ? 'image/jpeg' : 'video/mp4'
        });
        
        // Cria File a partir do Blob
        const file = new File([blob], `media.${mediaType === 'image' ? 'jpg' : 'mp4'}`, {
            type: mediaType === 'image' ? 'image/jpeg' : 'video/mp4'
        });
        
        return file;
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

    async loadMessages(forceUpdate = false) {
        // Evita atualizações simultâneas
        if (this.isLoadingMessages && !forceUpdate) {
            return;
        }

        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        this.isLoadingMessages = true;

        try {
            // OTIMIZAÇÃO: Carrega usuários bloqueados apenas uma vez no início
            // Não precisa carregar toda vez que carrega mensagens
            if (this.blockedUsers.length === 0) {
                await this.loadBlockedUsers();
            }

            const service = window.supabaseService;
            let messages = [];

            if (service && service.isReady()) {
                // Busca mensagens do Supabase
                if (this.chatMode === 'public') {
                    messages = await service.getPublicMessages(100);
                } else if (this.chatMode === 'private' && this.privateChatWith) {
                    // Verifica se o usuário está bloqueado
                    const isBlocked = this.blockedUsers.includes(this.privateChatWith);
                    if (isBlocked) {
                        chatMessages.innerHTML = '';
                        this.showEmptyState();
                        this.isLoadingMessages = false;
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

            // Cria uma chave simples para comparar (apenas IDs ordenados)
            const currentMessagesKey = JSON.stringify(filteredMessages.map(m => m.id).sort());
            const lastMessagesKey = this.lastMessagesList ? JSON.stringify(this.lastMessagesList.map(m => m.id).sort()) : null;

            // Se não houve mudanças e não é uma atualização forçada, não recria a lista
            if (!forceUpdate && currentMessagesKey === lastMessagesKey && chatMessages.children.length > 0) {
                // Apenas atualiza this.messages para compatibilidade
                this.messages = messages;
                this.isLoadingMessages = false;
                return; // Não recria a lista se não houve mudanças
            }

            // Limpa a lista apenas se necessário
            chatMessages.innerHTML = '';

            // Atualiza this.messages para compatibilidade
            this.messages = messages;

            if (filteredMessages.length === 0) {
                this.showEmptyState();
                this.lastMessagesList = [];
                this.isLoadingMessages = false;
                return;
            }

            // Renderiza as mensagens
            filteredMessages.forEach(message => {
                this.displayMessage(message);
            });

            // Armazena o estado atual para próxima comparação
            this.lastMessagesList = filteredMessages.map(m => ({ id: m.id }));

            this.scrollToBottom();
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            // Em caso de erro, tenta usar localStorage como fallback
            const fallbackMessages = JSON.parse(localStorage.getItem('chatMessages')) || [];
            if (fallbackMessages.length > 0) {
                this.messages = fallbackMessages;
                chatMessages.innerHTML = '';
                fallbackMessages.forEach(message => {
                    this.displayMessage(message);
                });
                this.scrollToBottom();
                this.lastMessagesList = fallbackMessages.map(m => ({ id: m.id }));
            } else {
                chatMessages.innerHTML = '';
                this.showEmptyState();
                this.lastMessagesList = [];
            }
        } finally {
            this.isLoadingMessages = false;
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
        // Usa mediaData ou media_url (para compatibilidade com mensagens do banco)
        const mediaUrl = message.mediaData || message.media_url;
        
        if (message.mediaType === 'image' && mediaUrl) {
            // Escapa a URL para evitar problemas com caracteres especiais
            const imageUrl = this.escapeHtml(mediaUrl);
            mediaContent = `<div class="message-media">
                <img src="${imageUrl}" alt="Imagem enviada" class="message-image" 
                     onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\'%3E%3Crect fill=\'%23ddd\' width=\'200\' height=\'200\'/%3E%3Ctext fill=\'%23999\' font-family=\'sans-serif\' font-size=\'14\' x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\'%3EErro ao carregar imagem%3C/text%3E%3C/svg%3E'; this.style.cursor='default';"
                     loading="lazy">
            </div>`;
        } else if (message.mediaType === 'video' && mediaUrl) {
            const videoUrl = this.escapeHtml(mediaUrl);
            mediaContent = `<div class="message-media">
                <video controls class="message-video" preload="metadata">
                    <source src="${videoUrl}" type="video/mp4">
                    Seu navegador não suporta vídeo.
                </video>
            </div>`;
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
                // Usa mediaData ou media_url (para compatibilidade)
                const imageUrl = message.mediaData || message.media_url;
                if (imageUrl) {
                    img.addEventListener('click', () => {
                        this.showImageModal(imageUrl);
                    });
                }
            }
        }
        
        this.scrollToBottom();
    }

    showImageModal(imageSrc) {
        // Remove modal anterior se existir
        const existingModal = document.querySelector('.image-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            cursor: pointer;
        `;
        
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = `
            position: relative;
            max-width: 95%;
            max-height: 95%;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const img = document.createElement('img');
        img.src = imageSrc;
        img.style.cssText = `
            max-width: 100%;
            max-height: 90vh;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            object-fit: contain;
        `;
        
        // Tratamento de erro de carregamento
        img.onerror = function() {
            this.style.display = 'none';
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                color: white;
                text-align: center;
                padding: 20px;
                font-size: 1.2em;
            `;
            errorDiv.textContent = 'Erro ao carregar imagem';
            imgContainer.appendChild(errorDiv);
        };
        
        // Botão de fechar
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: -40px;
            right: 0;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.5em;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
        `;
        closeBtn.onmouseover = function() {
            this.style.background = 'rgba(255, 255, 255, 0.3)';
        };
        closeBtn.onmouseout = function() {
            this.style.background = 'rgba(255, 255, 255, 0.2)';
        };
        
        imgContainer.appendChild(img);
        imgContainer.appendChild(closeBtn);
        modal.appendChild(imgContainer);
        document.body.appendChild(modal);
        
        // Fecha ao clicar no modal ou no botão de fechar
        const closeModal = () => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        };
        
        modal.addEventListener('click', (e) => {
            // Só fecha se clicar no fundo, não na imagem
            if (e.target === modal) {
                closeModal();
            }
        });
        
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeModal();
        });
        
        // Fecha com ESC
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    async startVideoCall() {
        // Só funciona em chat privado
        if (this.chatMode !== 'private' || !this.privateChatWith) {
            alert('Você só pode fazer vídeo chamada em conversas privadas. Selecione um usuário primeiro.');
            return;
        }

        // Verifica se o usuário está logado
        if (!this.currentUser || !this.currentUser.id) {
            alert('Você precisa estar logado para fazer vídeo chamada. Faça login novamente.');
            return;
        }

        try {
            const service = window.supabaseService;
            if (!service || !service.isReady()) {
                alert('Serviço não disponível. Tente novamente.');
                return;
            }

            // Cria convite de vídeo chamada
            const invite = await service.createVideoCallInvite(this.privateChatWith);
            console.log('✅ Convite de vídeo chamada criado:', invite);
            
            // Armazena o ID do convite
            this.currentVideoCallInviteId = invite.id;

            // Atualiza atividade
            this.updateActivity().catch(err => {
                console.warn('Erro ao atualizar atividade:', err);
            });
            
            // Mostra modal de chamada (aguardando resposta)
            const modal = document.getElementById('videoCallModal');
            const status = document.getElementById('videoCallStatus');
            if (modal) {
                modal.style.display = 'flex';
            }
            if (status) {
                status.textContent = 'Chamando... Aguardando resposta...';
                status.style.color = '#fff';
            }
            
            // Marca como chamador
            this.isCaller = true;

            // Solicita acesso à câmera e microfone
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(async (stream) => {
                    const localVideo = document.getElementById('localVideo');
                    const remoteVideo = document.getElementById('remoteVideo');
                    
                    console.log('📹 Stream obtido para quem chamou:', stream);
                    
                    if (localVideo) {
                        localVideo.srcObject = stream;
                        this.currentVideoStream = stream;
                        console.log('✅ Vídeo local configurado para quem chamou');
                        
                        // Força o vídeo a carregar
                        localVideo.play().catch(err => {
                            console.error('Erro ao reproduzir vídeo local:', err);
                        });
                    }
                    
                    // Limpa remoteVideo se houver stream anterior
                    if (remoteVideo && remoteVideo.srcObject) {
                        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
                        remoteVideo.srcObject = null;
                    }

                    // Cria conexão WebRTC e envia oferta quando o outro aceitar
                    // A oferta será enviada quando o convite for aceito (via handleVideoCallInviteUpdate)
                })
                .catch(err => {
                    console.error('Erro ao acessar mídia:', err);
                    if (status) {
                        status.textContent = 'Erro ao acessar câmera/microfone';
                        status.style.color = '#f44336';
                    }
                });
        } catch (error) {
            console.error('Erro ao iniciar vídeo chamada:', error);
            alert('Erro ao iniciar vídeo chamada: ' + (error.message || 'Tente novamente.'));
        }
    }

    async endVideoCall() {
        const modal = document.getElementById('videoCallModal');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
        // Fecha conexão WebRTC
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
            console.log('🔌 Conexão WebRTC fechada');
        }
        
        // Cancela convite se ainda estiver pendente
        if (this.currentVideoCallInviteId) {
            try {
                const service = window.supabaseService;
                if (service && service.isReady()) {
                    await service.cancelVideoCallInvite(this.currentVideoCallInviteId);
                }
            } catch (error) {
                console.error('Erro ao cancelar convite:', error);
            }
            this.currentVideoCallInviteId = null;
        }
        
        // Para os streams
        if (this.currentVideoStream) {
            this.currentVideoStream.getTracks().forEach(track => track.stop());
            this.currentVideoStream = null;
        }
        if (localVideo && localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }
        if (remoteVideo && remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
        }
        
        // Reseta flags
        this.isCaller = false;
        this.activeWebRTCInviteId = null;
        
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
            const service = window.supabaseService;
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
            const service = window.supabaseService;
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
            // OTIMIZAÇÃO: Usa this.blockedUsers diretamente (já carregado) em vez de query individual
            for (const user of otherUsers) {
                const userItem = document.createElement('div');
                const isActive = this.chatMode === 'private' && this.privateChatWith === user.id;
                const isBlocked = this.blockedUsers.includes(user.id);
                userItem.className = `user-item ${isActive ? 'active' : ''} ${isBlocked ? 'blocked' : ''}`;
                
                // OTIMIZAÇÃO: Usa this.blockedUsers diretamente (já temos a lista completa)
                const isUserBlocked = isBlocked;
                
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
            const service = window.supabaseService;
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
            const service = window.supabaseService;
            if (service && service.isReady()) {
                await service.blockUser(userId);
                this.blockedUsers.push(userId);
                
                // Se estava conversando com esse usuário, volta ao público
                if (this.privateChatWith === userId) {
                    this.switchToPublicChat();
                }
                
                // Recarrega a lista de usuários
                await this.loadOnlineUsers(true); // Força atualização após bloquear
                await this.loadMessages(true); // Força atualização após bloquear
                
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
            const service = window.supabaseService;
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
        await this.loadMessages(true); // Força atualização ao mudar de modo
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
        await this.loadMessages(true); // Força atualização ao mudar de modo
        await this.loadOnlineUsers(true); // Força atualização ao mudar de modo
        document.getElementById('messageInput').placeholder = `Mensagem privada para ${this.escapeHtml(userName)}...`;
    }

    async getUserById(userId) {
        try {
            const service = window.supabaseService;
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
        // Nota: Com Supabase, isso não é mais necessário, mas mantido para compatibilidade
        window.addEventListener('storage', (e) => {
            if (e.key === 'chatMessages') {
                // Não recarrega automaticamente - o Supabase já atualiza via polling
                // this.loadMessages(true); // Comentado para evitar piscar
            }
            if (e.key === 'chatUsers') {
                this.loadOnlineUsers(true); // Força atualização quando há mudança no storage
            }
        });
    }

    cleanupRealtime() {
        // Desinscreve-se dos canais Realtime
        const service = window.supabaseService || supabaseService;
        if (service && service.isReady()) {
            try {
                if (this.messageChannel) {
                    service.unsubscribe(this.messageChannel);
                    this.messageChannel = null;
                }
                if (this.profileChannel) {
                    service.unsubscribe(this.profileChannel);
                    this.profileChannel = null;
                }
            } catch (error) {
                console.error('Erro ao desinscrever-se do Realtime:', error);
            }
        }
    }

    setupBeforeUnload() {
        // Marca o usuário como offline quando a página/janela for fechada
        window.addEventListener('beforeunload', () => {
            // Desinscreve-se do Realtime
            this.cleanupRealtime();
            
            const userId = this.currentUser ? this.currentUser.id : null;
            if (userId) {
                const service = window.supabaseService;
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

    initRealtime() {
        const service = window.supabaseService || supabaseService;
        if (!service || !service.isReady()) {
            // Tenta novamente após um delay
            setTimeout(() => this.initRealtime(), 1000);
            return;
        }

        try {
            // Inscreve-se em novas mensagens
            this.messageChannel = service.subscribeToMessages((payload) => {
                if (payload.eventType === 'INSERT') {
                    this.handleNewMessage(payload.new);
                }
            });

            // Inscreve-se em atualizações de perfis (usuários online)
            // OTIMIZAÇÃO: Usa debounce para evitar atualizações excessivas
            let profileUpdateTimer = null;
            this.profileChannel = service.subscribeToProfiles((payload) => {
                if (payload.eventType === 'UPDATE') {
                    // Debounce: atualiza lista no máximo a cada 2 segundos
                    if (profileUpdateTimer) {
                        clearTimeout(profileUpdateTimer);
                    }
                    profileUpdateTimer = setTimeout(() => {
                        this.loadOnlineUsers(false);
                    }, 2000);
                }
            });

            console.log('✅ Realtime conectado - mensagens em tempo real ativadas');
        } catch (error) {
            console.error('Erro ao inicializar Realtime:', error);
        }
    }

    initVideoCallInvites() {
        const service = window.supabaseService || supabaseService;
        if (!service || !service.isReady()) {
            setTimeout(() => this.initVideoCallInvites(), 1000);
            return;
        }

        try {
            // Inscreve-se em convites de vídeo chamada
            this.videoCallInviteChannel = service.subscribeToVideoCallInvites((payload) => {
                console.log('📡 Payload recebido do Realtime:', payload);
                console.log('📋 Event Type:', payload.eventType);
                
                if (payload.eventType === 'INSERT' || payload.eventType === 'insert') {
                    // Novo convite recebido
                    console.log('➕ Novo convite detectado:', payload.new);
                    this.handleIncomingVideoCallInvite(payload.new);
                } else if (payload.eventType === 'UPDATE' || payload.eventType === 'update') {
                    // Convite foi aceito/recusado/cancelado
                    console.log('🔄 Convite atualizado:', payload.new);
                    this.handleVideoCallInviteUpdate(payload.new);
                } else {
                    console.log('❓ Event type desconhecido:', payload.eventType);
                }
            });

            // Carrega convites pendentes ao iniciar
            this.loadPendingVideoCallInvites();

            // Inicia escuta de sinais WebRTC
            this.initWebRTCSignaling();

            console.log('✅ Escuta de convites de vídeo chamada ativada');
        } catch (error) {
            console.error('Erro ao inicializar escuta de convites:', error);
        }
    }

    async loadPendingVideoCallInvites() {
        try {
            const service = window.supabaseService;
            if (!service || !service.isReady()) return;

            const invites = await service.getPendingVideoCallInvites();
            if (invites && invites.length > 0) {
                // Mostra o convite mais recente
                this.showVideoCallInviteModal(invites[0]);
            }
        } catch (error) {
            console.error('Erro ao carregar convites pendentes:', error);
        }
    }

    handleIncomingVideoCallInvite(invite) {
        console.log('📞 Convite recebido via Realtime:', invite);
        console.log('👤 Usuário atual:', this.currentUser?.id);
        console.log('📨 Recipient ID do convite:', invite.recipient_id);
        
        // Verifica se o convite é para o usuário atual
        if (!this.currentUser || !this.currentUser.id) {
            console.warn('⚠️ Usuário atual não está definido');
            return;
        }
        
        if (invite.recipient_id === this.currentUser.id && invite.status === 'pending') {
            console.log('✅ Convite é para este usuário, mostrando modal...');
            this.showVideoCallInviteModal(invite);
        } else {
            console.log('ℹ️ Convite não é para este usuário ou não está pendente');
        }
    }

    async handleVideoCallInviteUpdate(invite) {
        console.log('🔄 Convite atualizado:', invite);
        console.log('👤 Usuário atual:', this.currentUser?.id);
        console.log('📞 Caller ID:', invite.caller_id);
        console.log('📨 Recipient ID:', invite.recipient_id);
        console.log('📊 Status:', invite.status);
        
        if (!this.currentUser || !this.currentUser.id) {
            console.warn('⚠️ Usuário atual não está definido');
            return;
        }
        
        // Se o convite foi aceito
        if (invite.status === 'accepted') {
            // Se o usuário atual é quem chamou
            if (invite.caller_id === this.currentUser.id) {
                console.log('✅ Convite aceito - iniciando WebRTC para quem chamou');
                this.isCaller = true;
                // Armazena o inviteId para WebRTC
                this.activeWebRTCInviteId = invite.id;
                
                // Cria conexão WebRTC e envia oferta
                if (this.currentVideoStream) {
                    await this.createPeerConnection();
                    // Aguarda um pouco para garantir que o outro lado está pronto
                    setTimeout(() => {
                        this.sendOffer();
                    }, 500);
                }
                
                const status = document.getElementById('videoCallStatus');
                if (status) {
                    status.textContent = 'Conectando...';
                    status.style.color = '#fff';
                }
                // Garante que o modal de vídeo chamada está aberto
                const videoCallModal = document.getElementById('videoCallModal');
                if (videoCallModal && videoCallModal.style.display === 'none') {
                    videoCallModal.style.display = 'flex';
                }
            }
            // Se o usuário atual é quem aceitou, o modal já foi aberto em acceptVideoCall()
            // Mas vamos garantir que está aberto
            else if (invite.recipient_id === this.currentUser.id) {
                console.log('✅ Convite aceito - aguardando oferta WebRTC de quem chamou');
                this.isCaller = false;
                // Armazena o inviteId para WebRTC
                this.activeWebRTCInviteId = invite.id;
                
                // A oferta será recebida via handleWebRTCSignal
                const videoCallModal = document.getElementById('videoCallModal');
                const status = document.getElementById('videoCallStatus');
                if (videoCallModal) {
                    videoCallModal.style.display = 'flex';
                }
                if (status) {
                    status.textContent = 'Conectando...';
                    status.style.color = '#fff';
                }
            }
        } 
        // Se o convite foi recusado
        else if (invite.status === 'rejected') {
            if (invite.recipient_id === this.currentUser.id) {
                // Quem recusou - fecha modal de convite
                this.hideVideoCallInviteModal();
            } else if (invite.caller_id === this.currentUser.id) {
                // Quem chamou - fecha modal de vídeo chamada
                const videoCallModal = document.getElementById('videoCallModal');
                if (videoCallModal) {
                    videoCallModal.style.display = 'none';
                }
                alert('A chamada foi recusada.');
            }
        } 
        // Se o convite foi cancelado
        else if (invite.status === 'cancelled') {
            if (invite.recipient_id === this.currentUser.id) {
                // Quem recebeu - fecha modal de convite
                this.hideVideoCallInviteModal();
            } else if (invite.caller_id === this.currentUser.id) {
                // Quem chamou - fecha modal de vídeo chamada
                const videoCallModal = document.getElementById('videoCallModal');
                if (videoCallModal) {
                    videoCallModal.style.display = 'none';
                }
            }
        }
    }

    showVideoCallInviteModal(invite) {
        const modal = document.getElementById('videoCallInviteModal');
        const callerName = document.getElementById('callerName');
        const callerCity = document.getElementById('callerCity');
        
        if (!modal || !invite) return;

        // Armazena o ID do convite
        this.currentIncomingVideoCallInviteId = invite.id;

        // Preenche informações do chamador
        if (invite.caller) {
            callerName.textContent = invite.caller.nickname || 'Usuário';
            callerCity.textContent = invite.caller.city || '';
        } else {
            // Busca informações do chamador se não vier no payload
            this.getUserById(invite.caller_id).then(user => {
                if (user) {
                    callerName.textContent = user.nickname || 'Usuário';
                    callerCity.textContent = user.city || '';
                }
            });
        }

        modal.style.display = 'flex';
    }

    hideVideoCallInviteModal() {
        const modal = document.getElementById('videoCallInviteModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.currentIncomingVideoCallInviteId = null;
    }

    async acceptVideoCall() {
        if (!this.currentIncomingVideoCallInviteId) {
            console.warn('⚠️ Nenhum convite para aceitar');
            return;
        }

        console.log('✅ Aceitando convite:', this.currentIncomingVideoCallInviteId);

        try {
            const service = window.supabaseService;
            if (!service || !service.isReady()) {
                alert('Serviço não disponível. Tente novamente.');
                return;
            }

            // Aceita o convite
            const acceptedInvite = await service.acceptVideoCallInvite(this.currentIncomingVideoCallInviteId);
            console.log('✅ Convite aceito com sucesso:', acceptedInvite);

            // Armazena o inviteId para WebRTC (importante para enviar sinais)
            this.activeWebRTCInviteId = acceptedInvite.id;

            // Define o usuário com quem está conversando (para WebRTC)
            this.privateChatWith = acceptedInvite.caller_id;

            // Esconde o modal de convite
            this.hideVideoCallInviteModal();

            // Mostra o modal de vídeo chamada PRIMEIRO
            const videoCallModal = document.getElementById('videoCallModal');
            const status = document.getElementById('videoCallStatus');
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            
            if (!videoCallModal) {
                console.error('❌ Modal de vídeo chamada não encontrado!');
                alert('Erro: Modal de vídeo chamada não encontrado.');
                return;
            }
            
            // Abre o modal primeiro
            videoCallModal.style.display = 'flex';
            console.log('📹 Modal de vídeo chamada aberto para quem aceitou');
            
            // Limpa qualquer stream anterior
            if (localVideo && localVideo.srcObject) {
                localVideo.srcObject.getTracks().forEach(track => track.stop());
                localVideo.srcObject = null;
            }
            if (remoteVideo && remoteVideo.srcObject) {
                remoteVideo.srcObject.getTracks().forEach(track => track.stop());
                remoteVideo.srcObject = null;
            }
            
            if (status) {
                status.textContent = 'Conectando...';
                status.style.color = '#fff';
            }

            // Marca como não é chamador
            this.isCaller = false;

            // Solicita acesso à câmera e microfone
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(async (stream) => {
                    console.log('📹 Stream obtido para quem aceitou:', stream);
                    if (localVideo) {
                        localVideo.srcObject = stream;
                        this.currentVideoStream = stream;
                        console.log('✅ Vídeo local configurado para quem aceitou');
                        
                        // Força o vídeo a carregar
                        localVideo.play().catch(err => {
                            console.error('Erro ao reproduzir vídeo local:', err);
                        });
                    } else {
                        console.error('❌ Elemento localVideo não encontrado!');
                    }
                    
                    // Cria conexão WebRTC (a oferta será recebida via Realtime)
                    await this.createPeerConnection();
                    
                    if (status) {
                        status.textContent = 'Conectando...';
                        status.style.color = '#fff';
                    }
                })
                .catch(err => {
                    console.error('Erro ao acessar mídia:', err);
                    if (status) {
                        status.textContent = 'Erro ao acessar câmera/microfone';
                        status.style.color = '#f44336';
                    }
                });
        } catch (error) {
            console.error('Erro ao aceitar vídeo chamada:', error);
            alert('Erro ao aceitar vídeo chamada: ' + (error.message || 'Tente novamente.'));
        }
    }

    async rejectVideoCall() {
        if (!this.currentIncomingVideoCallInviteId) return;

        try {
            const service = window.supabaseService;
            if (!service || !service.isReady()) {
                alert('Serviço não disponível. Tente novamente.');
                return;
            }

            // Recusa o convite
            await service.rejectVideoCallInvite(this.currentIncomingVideoCallInviteId);

            // Esconde o modal
            this.hideVideoCallInviteModal();
        } catch (error) {
            console.error('Erro ao recusar vídeo chamada:', error);
            alert('Erro ao recusar vídeo chamada. Tente novamente.');
        }
    }

    async handleNewMessage(newMessage) {
        // O payload do Realtime pode vir em diferentes formatos
        // Precisamos buscar o perfil do usuário se não vier no payload
        let nickname = 'Usuário';
        let city = '';
        
        if (newMessage.profiles) {
            nickname = newMessage.profiles.nickname || 'Usuário';
            city = newMessage.profiles.city || '';
        } else {
            // Se não vier o perfil, busca do Supabase
            try {
                const service = window.supabaseService;
                if (service && service.isReady()) {
                    const { data } = await service.client
                        .from('profiles')
                        .select('nickname, city')
                        .eq('id', newMessage.user_id)
                        .single();
                    if (data) {
                        nickname = data.nickname || 'Usuário';
                        city = data.city || '';
                    }
                }
            } catch (error) {
                console.warn('Erro ao buscar perfil da mensagem:', error);
            }
        }

        // Formata a mensagem para o formato esperado
        const formattedMessage = {
            id: newMessage.id,
            userId: newMessage.user_id,
            nickname: nickname,
            city: city,
            content: newMessage.content,
            type: newMessage.type,
            mediaType: newMessage.media_type,
            mediaData: newMessage.media_url,
            recipientId: newMessage.recipient_id,
            timestamp: newMessage.created_at
        };

        // Verifica se a mensagem é relevante para o usuário atual
        if (!this.shouldDisplayMessage(formattedMessage)) {
            return; // Ignora mensagens não relevantes
        }

        // Verifica se a mensagem já existe (evita duplicatas)
        const messageExists = this.messages.some(m => m.id === formattedMessage.id);
        if (messageExists) {
            return; // Mensagem já existe, não adiciona novamente
        }

        // Adiciona a mensagem à lista
        this.messages.push(formattedMessage);

        // Exibe a mensagem na interface (sem recriar toda a lista)
        this.displayMessage(formattedMessage);

        // Atualiza o estado para comparação
        if (this.lastMessagesList) {
            this.lastMessagesList.push({ id: formattedMessage.id });
        }

        // Scroll para a nova mensagem
        this.scrollToBottom();
    }

    shouldDisplayMessage(message) {
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
        return false;
    }

    startPeriodicUpdates() {
        // REMOVIDO: Polling desnecessário - Realtime já faz tudo em tempo real
        // O Realtime via WebSockets é muito mais eficiente que polling
        // Se o Realtime não estiver funcionando, o usuário verá erro no console
        // e pode recarregar a página
        
        // Apenas um fallback muito raro (5 minutos) caso Realtime falhe completamente
        setInterval(() => {
            // Só atualiza se Realtime não estiver funcionando E não houver mensagens recentes
            if (!this.messageChannel && this.messages.length === 0) {
                console.warn('⚠️ Realtime não está funcionando, fazendo fallback...');
                this.loadMessages(false);
            }
        }, 300000); // 5 minutos - apenas em caso de falha total do Realtime
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
            const service = window.supabaseService;
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

    // ========== WEBRTC FUNCTIONS ==========

    initWebRTCSignaling() {
        const service = window.supabaseService || supabaseService;
        if (!service || !service.isReady()) {
            setTimeout(() => this.initWebRTCSignaling(), 1000);
            return;
        }

        try {
            // Inscreve-se em sinais WebRTC
            this.webrtcSignalChannel = service.subscribeToWebRTCSignals((payload) => {
                console.log('📡 Sinal WebRTC recebido:', payload);
                if (payload.new) {
                    this.handleWebRTCSignal(payload.new);
                }
            });
            console.log('✅ Escuta de sinais WebRTC ativada');
        } catch (error) {
            console.error('Erro ao inicializar escuta de sinais WebRTC:', error);
        }
    }

    async handleWebRTCSignal(signal) {
        if (!this.currentUser || !this.currentUser.id) return;
        
        // Verifica se o sinal é para este usuário
        if (signal.to_user_id !== this.currentUser.id) {
            console.log('ℹ️ Sinal WebRTC não é para este usuário');
            return;
        }

        console.log('📨 Processando sinal WebRTC:', signal.signal_type);

        try {
            if (signal.signal_type === 'offer') {
                // Recebeu uma oferta, precisa criar resposta
                await this.handleOffer(signal);
            } else if (signal.signal_type === 'answer') {
                // Recebeu uma resposta, precisa configurar
                await this.handleAnswer(signal);
            } else if (signal.signal_type === 'ice-candidate') {
                // Recebeu um ICE candidate, precisa adicionar
                await this.handleICECandidate(signal);
            }
        } catch (error) {
            console.error('Erro ao processar sinal WebRTC:', error);
        }
    }

    async createPeerConnection() {
        // Configuração STUN/TURN (pode adicionar servidores TURN depois se necessário)
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);
        console.log('✅ RTCPeerConnection criada');

        // Quando recebe stream remoto
        this.peerConnection.ontrack = (event) => {
            console.log('📹 Stream remoto recebido:', event.streams[0]);
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.play().catch(err => {
                    console.error('Erro ao reproduzir vídeo remoto:', err);
                });
            }
        };

        // Quando há novos ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('🧊 ICE candidate gerado:', event.candidate);
                this.sendICECandidate(event.candidate);
            }
        };

        // Quando a conexão muda de estado
        this.peerConnection.onconnectionstatechange = () => {
            console.log('🔌 Estado da conexão:', this.peerConnection.connectionState);
            const status = document.getElementById('videoCallStatus');
            if (status) {
                if (this.peerConnection.connectionState === 'connected') {
                    status.textContent = 'Conectado';
                    status.style.color = '#4caf50';
                } else if (this.peerConnection.connectionState === 'disconnected' || 
                          this.peerConnection.connectionState === 'failed') {
                    status.textContent = 'Desconectado';
                    status.style.color = '#f44336';
                }
            }
        };
    }

    async sendOffer() {
        if (!this.peerConnection || !this.currentVideoStream) return;

        // Valida se temos o inviteId necessário
        const inviteId = this.activeWebRTCInviteId || (this.isCaller ? this.currentVideoCallInviteId : this.currentIncomingVideoCallInviteId);
        if (!inviteId) {
            console.error('❌ Erro: inviteId não disponível para enviar oferta');
            return;
        }

        try {
            // Adiciona stream local à conexão
            this.currentVideoStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.currentVideoStream);
            });

            // Cria oferta
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            console.log('📤 Enviando oferta WebRTC...', { inviteId });
            
            const service = window.supabaseService;
            const toUserId = this.privateChatWith;

            if (!toUserId) {
                console.error('❌ Erro: toUserId não disponível');
                return;
            }

            await service.sendWebRTCSignal(
                inviteId,
                toUserId,
                'offer',
                { sdp: offer.sdp, type: offer.type }
            );
        } catch (error) {
            console.error('Erro ao criar/enviar oferta:', error);
        }
    }

    async handleOffer(signal) {
        if (!this.peerConnection) {
            await this.createPeerConnection();
        }

        try {
            // Adiciona stream local à conexão
            if (this.currentVideoStream) {
                this.currentVideoStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.currentVideoStream);
                });
            }

            // Configura descrição remota
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(signal.signal_data)
            );

            // Cria resposta
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            console.log('📤 Enviando resposta WebRTC...');
            
            const service = window.supabaseService;
            const inviteId = signal.invite_id;
            const toUserId = signal.from_user_id;

            // Armazena o inviteId para futuros sinais
            if (!this.activeWebRTCInviteId) {
                this.activeWebRTCInviteId = inviteId;
            }

            if (!inviteId || !toUserId) {
                console.error('❌ Erro: inviteId ou toUserId não disponível para enviar resposta');
                return;
            }

            await service.sendWebRTCSignal(
                inviteId,
                toUserId,
                'answer',
                { sdp: answer.sdp, type: answer.type }
            );
        } catch (error) {
            console.error('Erro ao processar oferta:', error);
        }
    }

    async handleAnswer(signal) {
        if (!this.peerConnection) {
            console.warn('⚠️ PeerConnection não existe ao receber resposta');
            return;
        }

        try {
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(signal.signal_data)
            );
            console.log('✅ Resposta WebRTC configurada');
        } catch (error) {
            console.error('Erro ao processar resposta:', error);
        }
    }

    async sendICECandidate(candidate) {
        // Valida se temos o inviteId necessário
        const inviteId = this.activeWebRTCInviteId || (this.isCaller ? this.currentVideoCallInviteId : this.currentIncomingVideoCallInviteId);
        if (!inviteId) {
            console.warn('⚠️ inviteId não disponível, ignorando ICE candidate');
            return;
        }

        const toUserId = this.privateChatWith;
        if (!toUserId) {
            console.warn('⚠️ toUserId não disponível, ignorando ICE candidate');
            return;
        }

        try {
            const service = window.supabaseService;
            await service.sendWebRTCSignal(
                inviteId,
                toUserId,
                'ice-candidate',
                {
                    candidate: candidate.candidate,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                    sdpMid: candidate.sdpMid
                }
            );
        } catch (error) {
            console.error('Erro ao enviar ICE candidate:', error);
        }
    }

    async handleICECandidate(signal) {
        if (!this.peerConnection) {
            console.warn('⚠️ PeerConnection não existe ao receber ICE candidate');
            return;
        }

        try {
            await this.peerConnection.addIceCandidate(
                new RTCIceCandidate(signal.signal_data)
            );
            console.log('✅ ICE candidate adicionado');
        } catch (error) {
            console.error('Erro ao processar ICE candidate:', error);
        }
    }
}

// Inicializa o chat quando a página carregar
if (window.location.pathname.includes('chat.html')) {
    const chatManager = new ChatManager();
}
